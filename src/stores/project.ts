import { ref, computed } from 'vue'
import { defineStore, getActivePinia } from 'pinia'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import type { InlineViewItem } from '@/stores/view'

/** 内联视图状态快照（切走时保存） */
export interface InlineViewSnapshot {
  nodeId: string
  viewId: string
  width: number
  height: number
  stageX: number
  stageY: number
  stageScale: number
  selectedNodeIds: string[]
  selectedConnectionIds: string[]
  editingNodeId: string | null
  connectingFrom: string | null
}

/** 主视图某节点的状态快照 */
export interface ViewSnapshot {
  stageX: number
  stageY: number
  stageScale: number
  selectedNodeIds: string[]
  selectedConnectionIds: string[]
  editingNodeId: string | null
  connectingFrom: string | null
  inlineViews: InlineViewSnapshot[]
}

/**
 * 项目 Store - 管理项目级导航与元数据
 *
 * 职责：
 * - 当前查看的节点 ID（currentNodeId）
 * - 项目名（根节点 text 的单一数据源派生）
 * - 节点树展开状态（左侧导航树的全局展开 / 收起）
 * - 视图快照（切走时保存/恢复各节点的独立导航状态）
 * - 内联视图实例的生命周期（销毁）
 *
 * 不存储节点 / 连线数据（归 nodeStore），不存储视口 / 选中（归 viewStore）。
 */
export const useProjectStore = defineStore('project', () => {
  const nodeStore = useNodeStore()

  // ── 确保主视图实例存在 ──
  useViewStore('main', { nodeId: ROOT_NODE_ID, type: 'main' })

  // ── 活跃视图 ──

  /** 主视图 ID 固定为 'main' */
  const activeViewId = ref<string>('main')

  /** 当前查看的节点 ID（从主视图 viewedNodeId 派生） */
  const currentNodeId = computed(() => useViewStore('main').viewedNodeId)

  /** 根视图 ID（项目节点，不可删除） */
  const rootViewId = computed(() => ROOT_NODE_ID)

  // ── 视图快照存储 ──

  /** 各节点的主视图状态快照（非响应式，仅用于保存/恢复） */
  const viewSnapshots = new Map<string, ViewSnapshot>()

  // ── 项目名（根节点 text 单一数据源）──

  /** 项目名 = 根节点 text */
  const projectName = computed(() => nodeStore.rootNode?.text ?? '未命名项目')

  /** 设置项目名 = 修改根节点 text */
  function setProjectName(name: string): void {
    nodeStore.setNodeText(ROOT_NODE_ID, name)
  }

  // ── 树展开状态（全局导航态）──

  /** 展开的节点 ID 集合（根节点默认展开） */
  const expandedIds = ref<Set<string>>(new Set([ROOT_NODE_ID]))

  /** 切换展开 / 收起 */
  function toggleExpand(id: string): void {
    const next = new Set(expandedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedIds.value = next
  }

  /** 展开（不切换收起） */
  function expand(id: string): void {
    if (expandedIds.value.has(id)) return
    const next = new Set(expandedIds.value)
    next.add(id)
    expandedIds.value = next
  }

  // ── 快照保存/恢复（私有）──

  /** 保存当前主视图状态为指定节点的快照 */
  function saveSnapshot(nodeId: string): void {
    const view = useViewStore('main')
    // 先结束编辑
    view.stopEditing()
    // 收集内联视图快照
    const inlineSnapshots: InlineViewSnapshot[] = view.inlineViews.map((iv: InlineViewItem) => {
      const ivView = useViewStore(iv.viewId)
      return {
        nodeId: iv.nodeId,
        viewId: iv.viewId,
        width: iv.width,
        height: iv.height,
        stageX: ivView.stageX,
        stageY: ivView.stageY,
        stageScale: ivView.stageScale,
        selectedNodeIds: Array.from(ivView.selectedNodeIds),
        selectedConnectionIds: Array.from(ivView.selectedConnectionIds),
        editingNodeId: ivView.editingNodeId,
        connectingFrom: ivView.connectingFrom,
      }
    })
    viewSnapshots.set(nodeId, {
      stageX: view.stageX,
      stageY: view.stageY,
      stageScale: view.stageScale,
      selectedNodeIds: Array.from(view.selectedNodeIds),
      selectedConnectionIds: Array.from(view.selectedConnectionIds),
      editingNodeId: view.editingNodeId,
      connectingFrom: view.connectingFrom,
      inlineViews: inlineSnapshots,
    })
  }

  /** 从快照恢复主视图状态到指定节点 */
  function restoreSnapshot(nodeId: string): void {
    const view = useViewStore('main')
    const snap = viewSnapshots.get(nodeId)
    if (!snap) {
      // 无快照：重置视图状态，视口归零
      view.resetViewState()
      view.stageX = 0
      view.stageY = 0
      view.stageScale = 1
      view.inlineViews = []
      return
    }
    // 恢复主视图状态
    view.stageX = snap.stageX
    view.stageY = snap.stageY
    view.stageScale = snap.stageScale
    view.selectedNodeIds = new Set(snap.selectedNodeIds)
    view.selectedConnectionIds = new Set(snap.selectedConnectionIds)
    view.editingNodeId = snap.editingNodeId
    view.connectingFrom = snap.connectingFrom
    // 重建内联视图
    view.inlineViews = []
    for (const ivSnap of snap.inlineViews) {
      const ivView = useViewStore(ivSnap.viewId, {
        nodeId: ivSnap.nodeId,
        type: 'inline',
        hostViewId: 'main',
      })
      ivView.stageX = ivSnap.stageX
      ivView.stageY = ivSnap.stageY
      ivView.stageScale = ivSnap.stageScale
      ivView.selectedNodeIds = new Set(ivSnap.selectedNodeIds)
      ivView.selectedConnectionIds = new Set(ivSnap.selectedConnectionIds)
      ivView.editingNodeId = ivSnap.editingNodeId
      ivView.connectingFrom = ivSnap.connectingFrom
      view.addInlineView(ivSnap.nodeId, ivSnap.viewId, ivSnap.width, ivSnap.height)
    }
  }

  // ── 视图切换 ──

  /**
   * 切换主视图到指定节点。
   * 切换前保存当前节点快照，切换后恢复目标节点快照。
   * 仅当该节点存在且不同于当前节点时切换。
   */
  function switchView(id: string): void {
    const view = useViewStore('main')
    if (view.viewedNodeId === id) return
    if (!nodeStore.nodes.has(id)) return
    // 保存当前快照
    saveSnapshot(view.viewedNodeId)
    // 销毁当前内联视图实例
    for (const iv of [...view.inlineViews]) {
      destroyView(iv.viewId)
    }
    view.inlineViews = []
    // 切换目标节点
    view.viewedNodeId = id
    // 恢复目标快照
    restoreSnapshot(id)
  }

  /** 进入节点子视图（语义同 switchView，保留此方法供调用） */
  function enterNodeView(nodeId: string): void {
    switchView(nodeId)
  }

  // ── viewStore 实例销毁 ──

  /**
   * 销毁指定 viewId 对应的 viewStore 实例（从 Pinia 内部 Map 中删除）。
   * 主视图实例 viewId='main' 常驻，永不销毁；只销毁内联视图实例。
   */
  function destroyView(viewId: string): void {
    if (viewId === 'main') return
    const pinia = getActivePinia()
    if (pinia) {
      ;((pinia as unknown) as { _s: Map<string, unknown> })._s.delete(`view-${viewId}`)
    }
  }

  /** 批量销毁 viewStore 实例 */
  function destroyViews(viewIds: string[]): void {
    for (const id of viewIds) destroyView(id)
  }

  /**
   * 清理 expandedIds 中已不存在的节点。
   * 供 history store 在 undo/redo 后调用。
   */
  function pruneExpanded(existingIds: Set<string>): void {
    let changed = false
    const next = new Set<string>()
    for (const id of expandedIds.value) {
      if (existingIds.has(id)) {
        next.add(id)
      } else {
        changed = true
      }
    }
    if (changed) {
      expandedIds.value = next
    }
  }

  return {
    // 活跃视图
    activeViewId,
    currentNodeId,
    rootViewId,
    // 项目名
    projectName,
    setProjectName,
    // 树展开
    expandedIds,
    toggleExpand,
    expand,
    // 视图切换
    switchView,
    enterNodeView,
    // viewStore 生命周期
    destroyView,
    destroyViews,
    pruneExpanded,
  }
})
