import { useProjectStore } from '@/stores/project'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useCommands } from '@/composables/useCommands'

/**
 * 快捷访问当前活跃视图的 composable
 *
 * 组合 project store（导航）、nodeStore（全局数据）与 per-view store（视图状态）。
 *
 * `view` 是一个 getter--每次访问时重新获取当前活跃视图的 store，
 * 确保切换视图后所有引用自动指向新的 store 实例。
 *
 * 数据与视图状态分离：
 * - `nodeStore`：全局唯一的节点树 + 连线数据（按 ID 操作）
 * - `view`：当前活跃视图的视口 / 选中 / 编辑状态
 * - `project`：活跃视图 ID、项目名、树展开状态
 *
 * 另提供若干跨 store 编排方法（选中 <-> 数据），封装"对选中项的操作"，
 * 使组件调用方式接近原 board API，减少迁移改动。
 * 所有写操作通过命令层（useCommands）执行，自动入历史栈。
 *
 * 用法：
 *   const active = useActiveView()
 *   active.view.stageX           // 当前视图视口
 *   active.nodeStore.childrenOf(active.project.currentNodeId)  // 当前视图节点
 *   active.deleteSelectedNodes() // 编排：删除选中节点
 */
export function useActiveView() {
  const project = useProjectStore()
  const nodeStore = useNodeStore()
  const commands = useCommands()

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
    textColor?: string
    backgroundColor?: string
    borderColor?: string
  }): void {
    commands.updateNodesStyle(Array.from(view().selectedNodeIds), partial)
  }

  /** 批量更新选中节点文本 */
  function updateSelectedNodesText(text: string): void {
    commands.updateNodesText(Array.from(view().selectedNodeIds), text)
  }

  /** 批量更新选中连线样式 */
  function updateSelectedConnectionsStyle(partial: {
    lineStyle?: import('@/types').LineStyle
    strokeWidth?: number
    strokeColor?: string
    directed?: boolean
  }): void {
    commands.updateConnectionsStyleByIds(
      Array.from(view().selectedConnectionIds),
      partial,
    )
  }

  /**
   * 删除所有选中节点（含各自子树）。
   * 视图协调（销毁 viewStore、活跃视图回退）已由命令层 + history store 处理。
   */
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
    deleteSelectedNodes,
    deleteSelectedConnections,
  }
}
