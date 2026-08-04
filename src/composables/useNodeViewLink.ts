import { useViewStore } from '@/stores/view'
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useCommands } from '@/composables/useCommands'

/**
 * 节点视图编排
 *
 * @param viewId - 视图 ID（主视图传 'main'）
 *
 * 跨 store 操作（nodeStore + viewStore + project）的统一入口：
 * - enterNodeView：进入选中节点的子级视图（任何节点均可进入）
 * - groupSelectedNodes：多选节点 -> 新建容器节点，reparent 选中节点 + 迁移内部连线
 * - clearNodeChildren：清空节点的所有子级（删除子树，保留节点本身）
 *
 * 组合和清空操作委托命令层（useCommands），自动入历史栈并处理视图协调。
 */
export function useNodeViewLink(viewId: string) {
  const view = useViewStore(viewId)
  const commands = useCommands()
  const node = useNodeStore()
  const project = useProjectStore()

  /**
   * 进入选中节点的子级视图（切换活跃视图）。
   * 任何节点均可进入--无需"关联白板"标记。
   * 纯视图操作，不入历史栈。
   */
  function enterNodeView(): void {
    const nodeId = view.selectedNodeId
    if (!nodeId) return
    project.switchView(nodeId)
  }

  /**
   * 进入选中节点父级视图（切换活跃视图）。
   * 纯视图操作，不入历史栈。
   */
  function enterParentNodeView(): void {
    const nodeId = view.viewedNodeId
    if (!nodeId) return
    const parentId = node.getNode(nodeId)?.parentId
    if (!parentId) return
    project.switchView(parentId)
  }

  /**
   * 组合（多选节点场景）
   * 委托命令层完成：包围盒计算、新建容器、迁移连线、reparent、入栈复合命令。
   */
  function groupSelectedNodes(): void {
    const ids = Array.from(view.selectedNodeIds)
    if (ids.length < 2) return
    const containerId = commands.groupNodes(ids)
    if (containerId) {
      view.selectNode(containerId)
    }
  }

  /**
   * 清空节点的所有子级（删除直接子节点及其子树，保留节点本身）。
   * 委托命令层完成：捕获子树、删除、视图协调、入栈。
   */
  function clearNodeChildren(nodeId: string): void {
    commands.clearNodeChildren(nodeId)
  }

  return {
    enterNodeView,
    enterParentNodeView,
    groupSelectedNodes,
    clearNodeChildren,
  }
}
