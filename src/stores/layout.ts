import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { PANEL_REGISTRY, type PanelId } from '@/constants/panels'

/**
 * 布局 Store - 左侧活动栏与面板状态
 *
 * 职责：
 * - 活动栏面板顺序（图标拖拽排序，内存态，本次不持久化）
 * - 当前激活面板（activePanelId），null 表示面板区收起
 *
 * 面板注册表（id / 图标 / 组件）位于 constants/panels.ts，本 store 只管理序态。
 */
export const useLayoutStore = defineStore('layout', () => {
  /** 活动栏面板顺序（默认 = 注册表顺序） */
  const panels = ref<PanelId[]>(PANEL_REGISTRY.map((p) => p.id))

  /** 当前激活面板 id；null = 面板区收起 */
  const activePanelId = ref<PanelId | null>(PANEL_REGISTRY[0]?.id ?? null)

  /** 最近一次激活的面板 id（收起后用于恢复展开） */
  const lastPanelId = ref<PanelId | null>(PANEL_REGISTRY[0]?.id ?? null)

  /** 面板区是否收起（activePanelId 为 null） */
  const collapsed = computed(() => activePanelId.value === null)

  /** 激活面板元信息（收起时为 null） */
  const activeMeta = computed(
    () => PANEL_REGISTRY.find((p) => p.id === activePanelId.value) ?? null,
  )

  /** 激活面板 id 是否在 panels 顺序中（防止 reorder 后引用失效） */
  const activeId = computed(() => {
    const id = activePanelId.value
    return id !== null && panels.value.includes(id) ? id : null
  })

  /**
   * 点击活动栏图标：同 id → 收起（置 null）；否则激活该面板。
   * 自然的 toggle 折叠/展开语义。
   */
  function togglePanel(id: PanelId): void {
    if (activePanelId.value === id) {
      activePanelId.value = null // 保留 lastPanelId，供后续 expand 恢复
    } else {
      activePanelId.value = id
      lastPanelId.value = id
    }
  }

  /** 直接激活某面板（不折叠当前面板）。无效 id 忽略。 */
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

  /** 收起面板区（保留 lastPanelId） */
  function collapse(): void {
    activePanelId.value = null
  }

  /** 展开面板区到最近激活的面板（无则回退到首个注册面板） */
  function expand(): void {
    const target = lastPanelId.value
    if (target !== null && panels.value.includes(target)) {
      activePanelId.value = target
    } else {
      activePanelId.value = panels.value[0] ?? null
    }
  }

  return {
    panels,
    activePanelId,
    activeId,
    activeMeta,
    collapsed,
    togglePanel,
    setActive,
    reorder,
    collapse,
    expand,
  }
})