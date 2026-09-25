/**
 * 浮动属性编辑器逻辑：全局选中（节点/连线）即显，解析渲染视图（内联优先，否则主视图），
 * 计算锚点屏幕坐标（内联视图内容被宿主缩放，需额外乘宿主 scale）。
 */
import { ref, computed, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { globalIsDraggingNode } from '@/composables/useNodeDragging'

/** 浮动编辑器底面与锚点之间的垂直间距（px） */
const ANCHOR_GAP = 8

export function useFloatingPropertyEditor() {
  const project = useProjectStore()
  const nodeStore = useNodeStore()
  /** 主视图 store（选中状态全局共享，内联视图转发到主视图） */
  const mainView: any = useViewStore('main')

  // ── 显隐 ──

  const hasNodeSelection = computed(() => mainView.selectedNodeIds.size > 0)
  const hasConnectionSelection = computed(() => mainView.selectedConnectionIds.size > 0)
  // 拖拽移动节点期间隐藏（节点仍选中，拖拽结束自动恢复显示）
  const hasSelection = computed(
    () => (hasNodeSelection.value || hasConnectionSelection.value) && !globalIsDraggingNode.value,
  )

  /** 选中类型：'node' | 'connection' | null（节点与连线互斥） */
  const selectionType = computed<'node' | 'connection' | null>(() => {
    if (hasNodeSelection.value) return 'node'
    if (hasConnectionSelection.value) return 'connection'
    return null
  })

  /** 选中项标识（选中变化时用于重置拖动偏移） */
  const selectionKey = computed(() => {
    const nid = mainView.selectedNodeId
    if (nid) return `node:${nid}`
    const cid = mainView.selectedConnectionId
    if (cid) return `conn:${cid}`
    return null
  })

  // ── 拖动偏移（无位置记忆）──

  const offset = ref<{ x: number; y: number }>({ x: 0, y: 0 })
  watch(selectionKey, () => {
    offset.value = { x: 0, y: 0 }
  })

  // ── 渲染视图解析 ──

  /**
   * 确定渲染给定父级节点的视图 store 实例。
   * 优先找展开节点（nodeId）等于 parentId 的内联视图；否则用主视图。
   */
  function resolveRenderView(parentId: string): any {
    const iv = (mainView.inlineViews as any[]).find((v) => v.nodeId === parentId)
    if (iv) return useViewStore(iv.viewId)
    return mainView
  }

  /** 视图 store 实例（松散类型，仅用到的字段；Pinia setup store 会解包 ref） */
  type ViewLike = {
    containerEl: HTMLElement | null
    stageScale: number
    stageX: number
    stageY: number
    type: 'main' | 'inline'
    hostViewId: string | null
  }

  /**
   * 世界坐标 → 屏幕坐标。
   * 内联视图内容被 CSS transform: scale(宿主缩放) 缩放，需额外乘宿主缩放。
   */
  function worldToScreen(view: ViewLike, worldX: number, worldY: number): { x: number; y: number } {
    const el = view.containerEl
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const sx = worldX * view.stageScale + view.stageX
    const sy = worldY * view.stageScale + view.stageY
    if (view.type === 'inline' && view.hostViewId) {
      const host = useViewStore(view.hostViewId)
      const hs = host.stageScale
      return { x: rect.left + sx * hs, y: rect.top + sy * hs }
    }
    return { x: rect.left + sx, y: rect.top + sy }
  }

  // ── 锚点（屏幕坐标）──

  const anchor = computed<{ x: number; y: number } | null>(() => {
    const type = selectionType.value
    if (type === 'node') {
      const id = mainView.selectedNodeId
      if (!id) return null
      const node = nodeStore.getNode(id)
      if (!node || node.parentId === null) return null
      const view = resolveRenderView(node.parentId)
      // 节点顶部居中偏上
      return worldToScreen(view, node.x + node.width / 2, node.y)
    }
    if (type === 'connection') {
      const id = mainView.selectedConnectionId
      if (!id) return null
      const found = nodeStore.findConnectionById(id)
      if (!found) return null
      const from = nodeStore.getNode(found.connection.fromNodeId)
      const to = nodeStore.getNode(found.connection.toNodeId)
      if (!from || !to) return null
      const view = resolveRenderView(found.parentId)
      // 两端节点中心连线的中点
      const p1 = worldToScreen(view, from.x + from.width / 2, from.y + from.height / 2)
      const p2 = worldToScreen(view, to.x + to.width / 2, to.y + to.height / 2)
      return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    }
    return null
  })

  /**
   * 面板基准左上角（锚点 + 拖动偏移，未做视口夹取）。
   * 组件内再通过 translate(-50%, -100%) 居中并置于锚点上方，并做视口夹取。
   */
  const basePosition = computed<{ x: number; y: number } | null>(() => {
    const a = anchor.value
    if (!a) return null
    return { x: a.x + offset.value.x, y: a.y - ANCHOR_GAP + offset.value.y }
  })

  return {
    project,
    nodeStore,
    mainView,
    hasSelection,
    selectionType,
    selectionKey,
    offset,
    anchor,
    basePosition,
  }
}