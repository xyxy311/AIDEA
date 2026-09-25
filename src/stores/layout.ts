import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { PanelKey } from '@/constants/panels'
import type { TopBarKey, TopBarZone } from '@/constants/topbar'
import {
  parseDockDelta,
  deriveDockLayout,
  reorderSeq,
  dropSize,
  DEFAULT_SIZE,
  type DockDelta,
} from '@/utils/dock'
import { parseTopDelta, deriveTopLayout, type TopDelta } from '@/utils/topbar'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import type { UiPanelEntry, UiTopBarEntry } from '@/stores/uiRegistry'

/**
 * 布局 Store —— 排布层（delta 模型）：uiRegistry（登记总表）→ 本 store（用户排布 + 持久化）→ 渲染组件。
 * localStorage 只存用户显式改动 delta（清空 = 恢复默认）；初始 parse 用不依赖插件发现集的谓词，
 * 插件发现集经 setDiscoveredPluginIds 回填后再重清洗（禁用→启用不丢布局）。纯状态转换在 utils/dock.ts / utils/topbar.ts。
 */
export const useLayoutStore = defineStore('layout', () => {
  // ── 登记总表（内置已 seed；插件注册后派生目录自动更新）──
  const registry = useUiRegistryStore()

  // ── 插件 key 合法性（delta 清洗用；发现集由 plugin store 装载完成前异步回填）──
  const discoveredPluginIds = ref(new Set<string>())
  /** 插件布局 key：`${pluginId}:${id}` 的 pluginId 前缀 ∈ 已发现插件集合 */
  const pluginPrefixKnown = (key: string): boolean => {
    const i = key.indexOf(':')
    return i > 0 && discoveredPluginIds.value.has(key.slice(0, i))
  }
  /** delta 键合法性（完整谓词）：当前已登记 ∪ 已发现插件前缀（禁用→启用保留布局记录） */
  const isKnown = (key: string): boolean =>
    registry.panels.has(key) || registry.topBarButtons.has(key) || pluginPrefixKnown(key)
  /**
   * delta 初始清洗谓词：不依赖插件发现集（回填是异步的，setup 时集合尚为空）。
   * 插件前缀键（含 ':'）初始一律保留——窗口期宁可多保留（派生层 filter(!!e) 与
   * 渲染层天然忽略未登记键），回填后经 setDiscoveredPluginIds 重清洗修正。
   */
  const isKnownInitial = (key: string): boolean =>
    registry.panels.has(key) || registry.topBarButtons.has(key) || key.includes(':')

  // ── localStorage 读写 ──
  /** 左侧用户顺序 delta */
  const STORAGE_LEFT = 'aidea-dock-left'
  /** 右侧用户顺序 delta */
  const STORAGE_RIGHT = 'aidea-dock-right'
  /** 右侧高度比例覆盖 */
  const STORAGE_SIZES = 'aidea-dock-sizes'
  /** 关闭（未放置）面板 */
  const STORAGE_REMOVED = 'aidea-dock-removed'
  /** 左顶部条用户顺序 delta */
  const STORAGE_TOP_LEFT = 'aidea-top-left'
  /** 右顶部条用户顺序 delta */
  const STORAGE_TOP_RIGHT = 'aidea-top-right'

  function readJson(key: string): unknown {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as unknown) : undefined
    } catch {
      return undefined
    }
  }
  function writeJson(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value))
  }

  // ── delta 状态（内存 ref；变更即持久化）──
  // 初始 parse 用 isKnownInitial：插件前缀键一律保留（发现集未回填，宁可多保留）
  const dockDelta = parseDockDelta(
    {
      leftOrder: readJson(STORAGE_LEFT),
      rightOrder: readJson(STORAGE_RIGHT),
      removed: readJson(STORAGE_REMOVED),
      rightSizes: readJson(STORAGE_SIZES),
    },
    isKnownInitial,
  )
  /** 左侧用户顺序（空 = 默认顺序） */
  const leftOrder = ref<PanelKey[]>(dockDelta.leftOrder ?? [])
  /** 右侧用户顺序（空 = 默认顺序） */
  const rightOrder = ref<PanelKey[]>(dockDelta.rightOrder ?? [])
  /** 关闭（未放置）的面板 */
  const removedPanels = ref<PanelKey[]>(dockDelta.removed ?? [])
  /** 右侧高度比例覆盖 */
  const rightSizes = ref<Record<string, number>>(dockDelta.rightSizes ?? {})

  const topDelta = parseTopDelta(
    { leftOrder: readJson(STORAGE_TOP_LEFT), rightOrder: readJson(STORAGE_TOP_RIGHT) },
    isKnownInitial,
  )
  /** 左顶部条用户顺序（空 = 默认顺序） */
  const leftTopOrder = ref<TopBarKey[]>(topDelta.leftOrder ?? [])
  /** 右顶部条用户顺序（空 = 默认顺序） */
  const rightTopOrder = ref<TopBarKey[]>(topDelta.rightOrder ?? [])

  function persistDock(): void {
    writeJson(STORAGE_LEFT, leftOrder.value)
    writeJson(STORAGE_RIGHT, rightOrder.value)
    writeJson(STORAGE_REMOVED, removedPanels.value)
    writeJson(STORAGE_SIZES, rightSizes.value)
  }
  function persistTop(): void {
    writeJson(STORAGE_TOP_LEFT, leftTopOrder.value)
    writeJson(STORAGE_TOP_RIGHT, rightTopOrder.value)
  }

  /**
   * 回填已发现插件 id（plugin store 在 installAll 之前、注册 UI 之前调用：
   * 面板 / 顶栏按钮 delta 在注册前即已正确）。
   * 回填后用完整谓词（内置键 ∪ 插件前缀 ∈ 发现集）重清洗五组 delta（dock 左右
   * 顺序 / removed / sizes + top 左右顺序）并各 persist 一次：初始 parse 阶段插件
   * 前缀键一律保留（isKnownInitial），此处剔除「发现集不含」的残留键——禁用→启用
   * 循环不丢布局，彻底移除的插件 delta 不滞留。
   */
  function setDiscoveredPluginIds(ids: string[]): void {
    discoveredPluginIds.value = new Set(ids)
    const dock = parseDockDelta(
      {
        leftOrder: leftOrder.value,
        rightOrder: rightOrder.value,
        removed: removedPanels.value,
        rightSizes: rightSizes.value,
      },
      isKnown,
    )
    leftOrder.value = dock.leftOrder ?? []
    rightOrder.value = dock.rightOrder ?? []
    removedPanels.value = dock.removed ?? []
    rightSizes.value = dock.rightSizes ?? {}
    const top = parseTopDelta(
      { leftOrder: leftTopOrder.value, rightOrder: rightTopOrder.value },
      isKnown,
    )
    leftTopOrder.value = top.leftOrder ?? []
    rightTopOrder.value = top.rightOrder ?? []
    persistDock()
    persistTop()
  }

  // ── 派生实时目录（下游渲染组件的渲染参考）──

  /** 两侧归属派生（登记条目直接满足 PlacementDef 结构） */
  const placement = computed(() =>
    deriveDockLayout([...registry.panels.values()], {
      leftOrder: leftOrder.value,
      rightOrder: rightOrder.value,
      removed: removedPanels.value,
    }),
  )
  /** 左侧活动栏实时目录（条目含 icon / component / 标题 / pluginId 归因） */
  const leftPanels = computed<UiPanelEntry[]>(() =>
    placement.value.left.map((k) => registry.panels.get(k)!).filter((e): e is UiPanelEntry => !!e),
  )
  /** 右侧 dock 实时目录（永不包含未登记 id，渲染层无需再过滤残留） */
  const rightPanels = computed<UiPanelEntry[]>(() =>
    placement.value.right.map((k) => registry.panels.get(k)!).filter((e): e is UiPanelEntry => !!e),
  )
  /** 未放置面板（关闭后面板；活动栏「+」列表来源） */
  const unplacedPanels = computed<UiPanelEntry[]>(() =>
    removedPanels.value.map((k) => registry.panels.get(k)!).filter((e): e is UiPanelEntry => !!e),
  )

  /** 顶栏两侧归属派生 */
  const topPlacement = computed(() =>
    deriveTopLayout([...registry.topBarButtons.values()], {
      leftOrder: leftTopOrder.value,
      rightOrder: rightTopOrder.value,
    }),
  )
  /** 左顶部条实时目录（插件按钮已包装为逻辑组件） */
  const topLeft = computed<UiTopBarEntry[]>(() =>
    topPlacement.value.left.map((k) => registry.topBarButtons.get(k)!).filter((e): e is UiTopBarEntry => !!e),
  )
  /** 右顶部条实时目录 */
  const topRight = computed<UiTopBarEntry[]>(() =>
    topPlacement.value.right.map((k) => registry.topBarButtons.get(k)!).filter((e): e is UiTopBarEntry => !!e),
  )

  // ── 激活面板状态（内存态，不持久化）──
  const activePanelId = ref<PanelKey | null>(placement.value.left[0] ?? null)
  const lastPanelId = ref<PanelKey | null>(placement.value.left[0] ?? null)

  /** 面板区是否收起（activePanelId 为 null） */
  const collapsed = computed(() => activePanelId.value === null)

  /** 激活面板元信息（收起时为 null） */
  const activeMeta = computed<UiPanelEntry | null>(() =>
    activePanelId.value !== null ? (registry.panels.get(activePanelId.value) ?? null) : null,
  )

  /** 激活面板 id 是否在左侧目录中（防 reorder / 移动后引用失效） */
  const activeId = computed(() => {
    const id = activePanelId.value
    return id !== null && placement.value.left.includes(id) ? id : null
  })

  // ── 左侧活动栏 ──

  function togglePanel(id: PanelKey): void {
    if (activePanelId.value === id) {
      activePanelId.value = null // 保留 lastPanelId，供后续 expand 恢复
    } else {
      activePanelId.value = id
      lastPanelId.value = id
    }
  }

  function setActive(id: PanelKey): void {
    if (placement.value.left.includes(id)) {
      activePanelId.value = id
      lastPanelId.value = id
    }
  }

  /** 调整面板在活动栏中的顺序：把 from 位的面板移动到 to 位（写顺序 delta） */
  function reorder(from: number, to: number): void {
    if (from === to) return
    leftOrder.value = reorderSeq(placement.value.left, from, to)
    persistDock()
  }

  function collapse(): void {
    activePanelId.value = null
  }

  function expand(): void {
    const target = lastPanelId.value
    if (target !== null && placement.value.left.includes(target)) {
      activePanelId.value = target
    } else {
      activePanelId.value = placement.value.left[0] ?? null
    }
  }

  // ── 右侧 dock + 左右互通 ──

  /** 右侧 dock 面板是否为空 */
  const rightEmpty = computed(() => rightPanels.value.length === 0)

  /** 把面板移入左侧活动栏（末尾追加；清跨侧 / 关闭记录） */
  function moveToLeft(panelId: PanelKey): void {
    leftOrder.value = [...placement.value.left.filter((k) => k !== panelId), panelId]
    rightOrder.value = rightOrder.value.filter((k) => k !== panelId)
    removedPanels.value = removedPanels.value.filter((k) => k !== panelId)
    rightSizes.value = dropSize(rightSizes.value, panelId)
    persistDock()
    // 若左侧当前无激活面板，激活移到左侧的面板
    if (activePanelId.value === null) {
      activePanelId.value = panelId
      lastPanelId.value = panelId
    }
  }

  /** 把面板移入右侧 dock 指定位置（左侧移除；补默认尺寸） */
  function moveToRight(panelId: PanelKey, toIndex = placement.value.right.length): void {
    const seq = placement.value.right.filter((k) => k !== panelId)
    const clamped = Math.max(0, Math.min(toIndex, seq.length))
    seq.splice(clamped, 0, panelId)
    rightOrder.value = seq
    leftOrder.value = leftOrder.value.filter((k) => k !== panelId)
    removedPanels.value = removedPanels.value.filter((k) => k !== panelId)
    if (!(panelId in rightSizes.value)) {
      rightSizes.value = { ...rightSizes.value, [panelId]: DEFAULT_SIZE }
    }
    persistDock()
    // 若移走的是当前激活面板，收起左侧面板区
    if (activePanelId.value === panelId) {
      activePanelId.value = null
    }
  }

  /** 右侧 dock 内换位（写右侧顺序 delta） */
  function reorderRight(from: number, to: number): void {
    if (from === to) return
    rightOrder.value = reorderSeq(placement.value.right, from, to)
    persistDock()
  }

  /** 设置右侧某面板的高度比例（覆盖 delta） */
  function setRightSize(panelId: PanelKey, flex: number): void {
    rightSizes.value = { ...rightSizes.value, [panelId]: Math.max(0.1, flex) }
    persistDock()
  }

  /** 关闭面板（回到未放置：进入 removed，两侧顺序记录清除） */
  function removePanel(panelId: PanelKey): void {
    removedPanels.value = [...removedPanels.value, panelId]
    leftOrder.value = leftOrder.value.filter((k) => k !== panelId)
    rightOrder.value = rightOrder.value.filter((k) => k !== panelId)
    rightSizes.value = dropSize(rightSizes.value, panelId)
    persistDock()
    if (activePanelId.value === panelId) {
      activePanelId.value = null
    }
  }

  /** 恢复默认布局：清空全部 dock / 顶栏 delta（登记默认顺序即时生效）。 */
  function resetDock(): void {
    localStorage.removeItem(STORAGE_LEFT)
    localStorage.removeItem(STORAGE_RIGHT)
    localStorage.removeItem(STORAGE_SIZES)
    localStorage.removeItem(STORAGE_REMOVED)
    resetTopBar()
    leftOrder.value = []
    rightOrder.value = []
    removedPanels.value = []
    rightSizes.value = {}
    const first = placement.value.left[0] ?? null
    activePanelId.value = first
    lastPanelId.value = first
  }

  // ── 顶部按钮条（左 / 右）──

  /** 顶部栏布局是否为空（左右都无按钮） */
  const topEmpty = computed(() => topLeft.value.length === 0 && topRight.value.length === 0)

  /** 某侧内换位：把 from 位按钮移动到 to 位（写该侧顺序 delta） */
  function reorderTop(zone: TopBarZone, from: number, to: number): void {
    if (from === to) return
    if (zone === 'left') {
      leftTopOrder.value = reorderSeq(topPlacement.value.left, from, to)
    } else {
      rightTopOrder.value = reorderSeq(topPlacement.value.right, from, to)
    }
    persistTop()
  }

  /** 把按钮移入目标侧（另一侧移除 + 目标侧末尾追加） */
  function moveTopZone(buttonId: TopBarKey, toZone: TopBarZone): void {
    if (toZone === 'left') {
      leftTopOrder.value = [...topPlacement.value.left.filter((k) => k !== buttonId), buttonId]
      rightTopOrder.value = rightTopOrder.value.filter((k) => k !== buttonId)
    } else {
      rightTopOrder.value = [...topPlacement.value.right.filter((k) => k !== buttonId), buttonId]
      leftTopOrder.value = leftTopOrder.value.filter((k) => k !== buttonId)
    }
    persistTop()
  }

  /** 恢复默认顶部按钮排列（清空顺序 delta） */
  function resetTopBar(): void {
    localStorage.removeItem(STORAGE_TOP_LEFT)
    localStorage.removeItem(STORAGE_TOP_RIGHT)
    leftTopOrder.value = []
    rightTopOrder.value = []
  }

  return {
    // 派生实时目录（渲染参考）
    leftPanels,
    rightPanels,
    unplacedPanels,
    rightSizes,
    rightEmpty,
    topLeft,
    topRight,
    topEmpty,
    // 激活状态
    activePanelId,
    activeId,
    activeMeta,
    collapsed,
    // 面板动作
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
    // 顶栏动作
    reorderTop,
    moveTopZone,
    resetTopBar,
    // 插件发现集回填（plugin store init 装载前调用，触发 delta 重清洗）
    setDiscoveredPluginIds,
  }
})
