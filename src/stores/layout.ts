import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import {
  PANEL_CATALOG,
  DEFAULT_LEFT_PANELS,
  DEFAULT_RIGHT_PANELS,
  type PanelId,
  type PanelKey,
} from '@/constants/panels'
import {
  defaultDockState,
  defaultRightSizes,
  normalizeDockState,
  moveToLeftCore,
  moveToRightCore,
  reorderRightCore,
  removePanelCore,
  setRightSizeCore,
  type DockState,
} from '@/utils/dock'
import {
  DEFAULT_LEFT_TOP,
  DEFAULT_RIGHT_TOP,
  type TopBarId,
  type TopBarKey,
  type TopBarZone,
} from '@/constants/topbar'
import {
  defaultTopBarState,
  normalizeTopBarState,
  reorderTopCore,
  moveTopZoneCore,
  type TopBarState,
} from '@/utils/topbar'
import { collectPluginEntries } from '@/plugin/manager'
import { useMergedPanelIndex } from '@/plugin/uiMerge'

/** 左侧活动栏顺序持久化 key */
const STORAGE_LEFT = 'aidea-dock-left'
/** 右侧 dock 顺序持久化 key */
const STORAGE_RIGHT = 'aidea-dock-right'
/** 右侧高度比例持久化 key */
const STORAGE_SIZES = 'aidea-dock-sizes'
/** 左顶部条按钮顺序持久化 key */
const STORAGE_TOP_LEFT = 'aidea-top-left'
/** 右顶部条按钮顺序持久化 key */
const STORAGE_TOP_RIGHT = 'aidea-top-right'

/**
 * 布局 Store - 左侧活动栏 + 右侧多面板 dock + 顶部左右按钮条
 *
 * 职责：
 * - 活动栏面板顺序（panels，左侧单面板区，可持久化）
 * - 当前激活面板（activePanelId，null 表示面板区收起）
 * - 右侧 dock 面板列表（rightPanels）与高度比例（rightSizes）
 * - 左 / 右顶部条按钮顺序（leftTop / rightTop，可持久化，可拖拽排序与跨区放置）
 *
 * 互通：
 * - 面板可在左侧（活动栏）与右侧（dock）之间移动（moveToLeft / moveToRight）
 * - 顶部按钮可在左 / 右顶部条之间移动（moveTopZone），同侧可 reorderTop 排序
 *
 * 面板注册表位于 constants/panels.ts；顶部按钮注册表位于 constants/topbar.ts。
 * 纯状态转换逻辑位于 utils/dock.ts（面板）与 utils/topbar.ts（顶部按钮），均可单测。
 */
export const useLayoutStore = defineStore('layout', () => {
  const allPanelIds = PANEL_CATALOG.map((p) => p.id)
  const allTopBarIds = DEFAULT_LEFT_TOP.concat(DEFAULT_RIGHT_TOP)

  // ── 插件布局 key 合法性（启动归一化用）──
  // collectPluginEntries 编译期同步可得全部插件（含未启用）——「已发现插件」集合
  // 用于归一化时保留插件布局记录（禁用→启用循环不丢位置；彻底移除才清除）。
  const discoveredPluginIds = new Set(collectPluginEntries().map((e) => e.id))
  /** 插件布局 key 合法性：`${pluginId}:${id}` 的 pluginId 前缀仍在已发现插件集合 */
  const isPluginKeyValid = (id: string): boolean => {
    const i = id.indexOf(':')
    return i > 0 && discoveredPluginIds.has(id.slice(0, i))
  }

  // ── 持久化状态（localStorage）──
  /** 活动栏面板顺序（默认 = 品类表 defaultPlacement='left'） */
  const panels = useStorage<PanelKey[]>(STORAGE_LEFT, [...DEFAULT_LEFT_PANELS])
  /** 右侧 dock 面板顺序（默认 = 品类表 defaultPlacement='right'） */
  const rightPanels = useStorage<PanelKey[]>(STORAGE_RIGHT, [...DEFAULT_RIGHT_PANELS])
  /** 右侧各面板高度比例 */
  const rightSizes = useStorage<Record<string, number>>(
    STORAGE_SIZES,
    defaultRightSizes(DEFAULT_RIGHT_PANELS),
  )

  // ── 加载时归一化（清理脏数据 / 保证互斥 / 补新增默认面板/插件）──
  const normalized = normalizeDockState(
    {
      leftPanels: panels.value,
      rightPanels: rightPanels.value,
      rightSizes: rightSizes.value,
    },
    allPanelIds,
    { left: DEFAULT_LEFT_PANELS, right: DEFAULT_RIGHT_PANELS },
    { isExtraValid: isPluginKeyValid },
  )
  panels.value = normalized.leftPanels
  rightPanels.value = normalized.rightPanels
  rightSizes.value = normalized.rightSizes

  // ── 顶部按钮条（左 / 右）──
  /** 左顶部条按钮顺序（默认 = 品类表 defaultZone='left'） */
  const leftTop = useStorage<TopBarKey[]>(STORAGE_TOP_LEFT, [...DEFAULT_LEFT_TOP])
  /** 右顶部条按钮顺序（默认 = 品类表 defaultZone='right'） */
  const rightTop = useStorage<TopBarKey[]>(STORAGE_TOP_RIGHT, [...DEFAULT_RIGHT_TOP])

  // 加载时归一化（清理脏数据 / 补新增默认按钮/插件按钮）
  const normalizedTop = normalizeTopBarState(
    { leftTop: leftTop.value, rightTop: rightTop.value },
    allTopBarIds,
    { left: DEFAULT_LEFT_TOP, right: DEFAULT_RIGHT_TOP },
    { isExtraValid: isPluginKeyValid },
  )
  leftTop.value = normalizedTop.leftTop
  rightTop.value = normalizedTop.rightTop

  // ── 左侧激活面板（内存态，不持久化）──
  /** 当前激活面板 id；null = 面板区收起 */
  const activePanelId = ref<PanelKey | null>(PANEL_CATALOG[0]?.id ?? null)
  /** 最近一次激活的面板 id（收起后用于恢复展开） */
  const lastPanelId = ref<PanelKey | null>(PANEL_CATALOG[0]?.id ?? null)

  /** 面板区是否收起（activePanelId 为 null） */
  const collapsed = computed(() => activePanelId.value === null)

  /** 合并面板目录索引（内置优先，插件兜底）——activeMeta 解析源 */
  const mergedPanelIndex = useMergedPanelIndex()

  /** 激活面板元信息（收起时为 null）；经合并目录查询，内置与插件面板均可解析 */
  const activeMeta = computed(
    () => (activePanelId.value !== null ? mergedPanelIndex.value.get(activePanelId.value) ?? null : null),
  )

  /** 激活面板 id 是否在 panels 顺序中（防止 reorder 后引用失效） */
  const activeId = computed(() => {
    const id = activePanelId.value
    return id !== null && panels.value.includes(id) ? id : null
  })

  // ── 左侧活动栏（现有语义保留）──

  function togglePanel(id: PanelId): void {
    if (activePanelId.value === id) {
      activePanelId.value = null // 保留 lastPanelId，供后续 expand 恢复
    } else {
      activePanelId.value = id
      lastPanelId.value = id
    }
  }

  function setActive(id: PanelId): void {
    if (panels.value.includes(id)) {
      activePanelId.value = id
      lastPanelId.value = id
    }
  }

  /** 调整面板在活动栏中的顺序：把 from 位的面板移动到 to 位。 */
  function reorder(from: number, to: number): void {
    if (from === to) return
    const next = [...panels.value]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    panels.value = next
  }

  function collapse(): void {
    activePanelId.value = null
  }

  function expand(): void {
    const target = lastPanelId.value
    if (target !== null && panels.value.includes(target)) {
      activePanelId.value = target
    } else {
      activePanelId.value = panels.value[0] ?? null
    }
  }

  // ── 右侧 dock + 左右互通 ──

  /** 右侧 dock 面板是否为空 */
  const rightEmpty = computed(() => rightPanels.value.length === 0)

  /** 把面板移入左侧活动栏（右侧移除 + 加入左侧末尾 + 激活）。 */
  function moveToLeft(panelId: PanelKey): void {
    const next = moveToLeftCore(
      { leftPanels: panels.value, rightPanels: rightPanels.value, rightSizes: rightSizes.value },
      panelId,
    )
    panels.value = next.leftPanels
    rightPanels.value = next.rightPanels
    rightSizes.value = next.rightSizes
    // 若左侧当前无激活面板，激活移到左侧的面板
    if (activePanelId.value === null) {
      activePanelId.value = panelId
      lastPanelId.value = panelId
    }
  }

  /** 把面板移入右侧 dock（左侧移除 + 加入右侧指定位置）。 */
  function moveToRight(panelId: PanelKey, toIndex = rightPanels.value.length): void {
    const next = moveToRightCore(
      { leftPanels: panels.value, rightPanels: rightPanels.value, rightSizes: rightSizes.value },
      panelId,
      toIndex,
    )
    panels.value = next.leftPanels
    rightPanels.value = next.rightPanels
    rightSizes.value = next.rightSizes
    // 若移走的是当前激活面板，收起左侧面板区
    if (activePanelId.value === panelId) {
      activePanelId.value = null
    }
  }

  /** 右侧 dock 内换位 */
  function reorderRight(from: number, to: number): void {
    const next = reorderRightCore(
      { leftPanels: panels.value, rightPanels: rightPanels.value, rightSizes: rightSizes.value },
      from,
      to,
    )
    rightPanels.value = next.rightPanels
  }

  /** 设置右侧某面板的高度比例 */
  function setRightSize(panelId: PanelKey, flex: number): void {
    const next = setRightSizeCore(
      { leftPanels: panels.value, rightPanels: rightPanels.value, rightSizes: rightSizes.value },
      panelId,
      flex,
    )
    rightSizes.value = next.rightSizes
  }

  /** 从两侧移除面板（回到未放置状态）。主要用于右侧 dock 面板关闭。 */
  function removePanel(panelId: PanelKey): void {
    const next = removePanelCore(
      { leftPanels: panels.value, rightPanels: rightPanels.value, rightSizes: rightSizes.value },
      panelId,
    )
    panels.value = next.leftPanels
    rightPanels.value = next.rightPanels
    rightSizes.value = next.rightSizes
    if (activePanelId.value === panelId) {
      activePanelId.value = null
    }
  }

  /** 恢复默认布局：删除持久化数据并重置面板 + 顶部按钮条为默认配置。 */
  function resetDock(): void {
    localStorage.removeItem(STORAGE_LEFT)
    localStorage.removeItem(STORAGE_RIGHT)
    localStorage.removeItem(STORAGE_SIZES)
    resetTopBar()
    const d = defaultDockState(DEFAULT_LEFT_PANELS, DEFAULT_RIGHT_PANELS)
    panels.value = d.leftPanels
    rightPanels.value = d.rightPanels
    rightSizes.value = d.rightSizes
    activePanelId.value = PANEL_CATALOG[0]?.id ?? null
    lastPanelId.value = PANEL_CATALOG[0]?.id ?? null
    // 注：插件面板不在内置默认内；由下次启动 setup 期间的 ensurePanel 自动加回
  }

  // ── 顶部按钮条（左 / 右）──

  /** 顶部栏布局是否为空（左右都无按钮）。 */
  const topEmpty = computed(() => leftTop.value.length === 0 && rightTop.value.length === 0)

  /** 读某侧顺序（供容器按 zone 取） */
  function topOrder(zone: TopBarZone): TopBarKey[] {
    return zone === 'left' ? leftTop.value : rightTop.value
  }

  /** 某侧内换位：把 from 位按钮移动到 to 位。 */
  function reorderTop(zone: TopBarZone, from: number, to: number): void {
    const next = reorderTopCore(
      { leftTop: leftTop.value, rightTop: rightTop.value },
      zone,
      from,
      to,
    )
    leftTop.value = next.leftTop
    rightTop.value = next.rightTop
  }

  /** 把按钮移入目标侧（另一侧移除 + 加入目标侧末尾）。 */
  function moveTopZone(buttonId: TopBarKey, toZone: TopBarZone): void {
    const next = moveTopZoneCore(
      { leftTop: leftTop.value, rightTop: rightTop.value },
      buttonId,
      toZone,
    )
    leftTop.value = next.leftTop
    rightTop.value = next.rightTop
  }

  /** 恢复默认顶部按钮排列（删除左 / 右下标的持久化数据并复位默认配置）。 */
  function resetTopBar(): void {
    localStorage.removeItem(STORAGE_TOP_LEFT)
    localStorage.removeItem(STORAGE_TOP_RIGHT)
    const t = defaultTopBarState(DEFAULT_LEFT_TOP, DEFAULT_RIGHT_TOP)
    leftTop.value = t.leftTop
    rightTop.value = t.rightTop
    // 注：插件按钮不在内置默认内；由下次启动 setup 期间的 ensureTop 自动加回
  }

  // ── 插件面板 / 顶栏按钮首次落位（幂等）──

  /**
   * 确保某面板已放置（插件面板首次注册时调用，幂等）：
   * - 已出现在任一侧（可能用户拖拽过或持久化保留）→ 不动，保护用户布局。
   * - 否则按 placement 追加到对应侧末尾；右侧同时补 rightSizes[id] = 1。
   */
  function ensurePanel(panelId: PanelKey, placement: 'left' | 'right'): void {
    if (panels.value.includes(panelId) || rightPanels.value.includes(panelId)) return
    if (placement === 'right') {
      rightPanels.value = [...rightPanels.value, panelId]
      rightSizes.value = { ...rightSizes.value, [panelId]: 1 }
    } else {
      panels.value = [...panels.value, panelId]
    }
  }

  /**
   * 确保某顶栏按钮已放置（插件按钮首次注册时调用，幂等）：
   * 已出现在任一侧 → 不动；否则追加到该侧末尾。
   */
  function ensureTop(buttonId: TopBarKey, zone: TopBarZone): void {
    if (leftTop.value.includes(buttonId) || rightTop.value.includes(buttonId)) return
    if (zone === 'left') leftTop.value = [...leftTop.value, buttonId]
    else rightTop.value = [...rightTop.value, buttonId]
  }

  return {
    panels,
    rightPanels,
    rightSizes,
    rightEmpty,
    activePanelId,
    activeId,
    activeMeta,
    collapsed,
    togglePanel,
    setActive,
    reorder,
    collapse,
    expand,
    moveToLeft,
    moveToRight,
    reorderRight,
    setRightSize,
    removePanel,
    resetDock,
    leftTop,
    rightTop,
    topEmpty,
    topOrder,
    reorderTop,
    moveTopZone,
    resetTopBar,
    ensurePanel,
    ensureTop,
  }
})