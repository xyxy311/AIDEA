import { useProjectStore } from '@/stores/project'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useCommands } from '@/composables/useCommands'
import { useClipboard } from '@/composables/useClipboard'
import { globalIsDraggingNode } from '@/composables/useNodeDragging'
import { GRID_G } from '@/constants'
import type { GridDirection } from '@/utils/grid'

/**
 * 快捷访问当前活跃视图：组合 project（导航）/nodeStore（数据）与 per-view（视图状态）。
 * view 为 getter，每次访问取最新 store；跨 store 编排方法统一经命令层入历史栈。
 */
export function useActiveView() {
  const project = useProjectStore()
  const nodeStore = useNodeStore()
  const commands = useCommands()
  const clipboard = useClipboard()

  /** 获取主视图 store（activeViewId 固定为 'main'） */
  function view() {
    return useViewStore(project.activeViewId)
  }

  // ── 编排：选中项 <-> 数据（委托命令层，自动入历史栈）──

  /** 更新当前节点名称 */
  function updateNodeName(name: string): void {
    commands.setNodeText(project.currentNodeId, name)
  }

  /** 批量更新选中节点样式 */
  function updateSelectedNodesStyle(partial: {
    borderColor?: string
  }): void {
    commands.updateNodesStyle(Array.from(view().selectedNodeIds), partial)
  }

  /** 批量更新选中节点文本 */
  function updateSelectedNodesText(text: string): void {
    commands.setNodesText(Array.from(view().selectedNodeIds), text)
  }

  /** 批量更新选中连线样式 */
  function updateSelectedConnectionsStyle(partial: {
    lineStyle?: import('@/types').LineStyle
    strokeWidth?: number
    strokeColor?: string
    directed?: boolean
    text?: string | null
  }): void {
    commands.updateConnectionsStyleByIds(
      Array.from(view().selectedConnectionIds),
      partial,
    )
  }

  /** 按节点分别设置标签（多选时各节点独立标签集合） */
  function updateSelectedNodesTagsPerNode(tagIdsPerNode: string[][]): void {
    commands.updateNodesTagsPerNode(Array.from(view().selectedNodeIds), tagIdsPerNode)
  }

  /** 删除所有选中节点（含子树；视图协调由命令层处理） */
  function deleteSelectedNodes(): void {
    const v = view()
    const ids = Array.from(v.selectedNodeIds)
    if (ids.length === 0) return
    commands.deleteNodes(ids)
    v.clearSelection()
  }

  /** 删除所有选中连线 */
  function deleteSelectedConnections(): void {
    const v = view()
    const ids = Array.from(v.selectedConnectionIds)
    if (ids.length === 0) return
    commands.deleteConnectionsByIds(ids)
    v.clearSelection()
  }

  /**
   * 方向键移动所有选中节点：仅移动「选中 ∩ 当前视图直接子节点」，步进 GRID_G 保持相对位置。
   * 实时 moveNode 改数据，再 commitNodeMove 入栈（coalesceKey 合并连续步进为单条历史）。
   */
  function moveSelectedNodesByArrow(dir: GridDirection): void {
    // 拖拽节点中不响应（避免与拖拽冲突）
    if (globalIsDraggingNode.value) return
    // 方向 → 步进（一格 G）
    const dx = dir === 'left' ? -GRID_G : dir === 'right' ? GRID_G : 0
    const dy = dir === 'up' ? -GRID_G : dir === 'down' ? GRID_G : 0
    const v = view()
    const childIds = new Set(nodeStore.childrenOf(v.viewedNodeId).map((c) => c.id))
    const selected = Array.from(v.selectedNodeIds).filter((id) => childIds.has(id))
    if (selected.length === 0) return

    // 记录移动前坐标
    const positions = selected.map((id) => {
      const n = nodeStore.getNode(id)!
      return { id, oldX: n.x, oldY: n.y }
    })

    // 实时移动所有选中节点（保持相对位置）
    for (const id of selected) {
      const n = nodeStore.getNode(id)!
      nodeStore.moveNode(id, n.x + dx, n.y + dy)
    }

    // 入栈（coalesce 合并连续步进；key 含视图 + 选中节点签名，切换选中后断开合并）
    const sortedSelected = [...selected].sort().join(',')
    commands.commitNodeMove(
      positions.map((p) => {
        const n = nodeStore.getNode(p.id)!
        return { id: p.id, oldX: p.oldX, oldY: p.oldY, newX: n.x, newY: n.y }
      }),
      { coalesceKey: `arrow-move-${project.activeViewId}-${sortedSelected}` },
    )
  }

  // ── 剪贴板编排：复制 / 剪切 / 粘贴（都不进入历史栈）──

  /** 剪贴板是否有可粘贴内容 */
  const canPaste = clipboard.canPaste

  /** 复制选中节点（含子树与内部连线）到剪贴板 */
  function copySelectedNodes(): boolean {
    return clipboard.copy(Array.from(view().selectedNodeIds))
  }

  /** 剪切选中节点（复制到剪贴板后删除原节点），并清空选中 */
  function cutSelectedNodes(): boolean {
    const v = view()
    const ok = clipboard.cut(Array.from(v.selectedNodeIds))
    if (ok) v.clearSelection()
    return ok
  }

  /** 粘贴剪贴板内容到当前视图，并选中新建的顶层节点 */
  function pasteIntoView(): string[] {
    const v = view()
    const ids = clipboard.paste(v.viewedNodeId)
    if (ids.length > 0) {
      v.clearSelection()
      v.setSelectedNodes(ids)
    }
    return ids
  }

  return {
    project,
    nodeStore,
    /** 当前活跃视图 store（getter，每次访问取最新） */
    get view() {
      return view()
    },
    // 编排方法
    updateNodeName,
    updateSelectedNodesStyle,
    updateSelectedNodesText,
    updateSelectedConnectionsStyle,
    updateSelectedNodesTagsPerNode,
    deleteSelectedNodes,
    deleteSelectedConnections,
    moveSelectedNodesByArrow,
    // 剪贴板
    canPaste,
    copySelectedNodes,
    cutSelectedNodes,
    pasteIntoView,
  }
}
