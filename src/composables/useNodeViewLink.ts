import { useViewStore } from '@/stores/view'
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useCommands } from '@/composables/useCommands'
import { generateId } from '@/utils/id'
import {
  INLINE_VIEW_DEFAULT_WIDTH,
  INLINE_VIEW_DEFAULT_HEIGHT,
  INLINE_VIEW_MIN_HEIGHT,
  INLINE_VIEW_TITLE_HEIGHT,
  INLINE_VIEW_FIT_PADDING,
  MIN_SCALE,
  MAX_SCALE,
} from '@/constants'
import { computeInlineFit } from '@/utils/view'

/**
 * 节点视图编排：跨 store（nodeStore + viewStore + project）统一入口。
 * 组合/清空委托命令层入历史栈；进入视图、展开/收起内联与自适应为纯视图操作不入栈。
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

  /**
   * 切换选中节点内联视图的展开/收起。
   * 仅主视图、单选节点时生效。
   * 纯视图操作，不入历史栈。
   */
  function toggleInlineView(nodeId?: string): void {
    if (!nodeId) return
    if (view.type !== 'main') return
    if (!node.isChildOf(nodeId, view.viewedNodeId)) return
    if (view.getInlineViewRect(nodeId)) {
      // 已展开 -> 收起
      const iv = view.inlineViews.find((v) => v.nodeId === nodeId)
      if (iv) {
        project.destroyView(iv.viewId)
        view.removeInlineView(nodeId)
      }
    } else {
      // 未展开 -> 展开
      const inlineViewId = generateId()
      useViewStore(inlineViewId, { nodeId, type: 'inline', hostViewId: viewId })
      // 内联视图初始尺寸 = 节点尺寸（自适应 fit 触发前），随后 fitInlineView 可能调整高度
      const n = node.getNode(nodeId)
      view.addInlineView(
        nodeId,
        inlineViewId,
        n?.width ?? INLINE_VIEW_DEFAULT_WIDTH,
        n?.height ?? INLINE_VIEW_DEFAULT_HEIGHT,
      )
      fitInlineView(nodeId)
    }
  }

  /**
   * 自适应内联视图：以当前内联视图宽度为基准，自动调整缩放倍率与高度，
   * 使所有子节点刚好显示（含余量）。缩放超出 [MIN_SCALE, MAX_SCALE] 时 clamp 到边界。
   * 仅主视图、已展开内联视图时生效。纯视图操作，不入历史栈。
   */
  function fitInlineView(nodeId?: string): void {
    if (!nodeId) return
    if (view.type !== 'main') return
    const iv = view.inlineViews.find((v) => v.nodeId === nodeId)
    if (!iv) return
    const rect = view.getInlineViewRect(nodeId)
    if (!rect || rect.width <= 0) return
    const children = node.childrenOf(nodeId)
    const result = computeInlineFit(
      children,
      rect.width,
      INLINE_VIEW_FIT_PADDING,
      MIN_SCALE,
      MAX_SCALE,
      INLINE_VIEW_TITLE_HEIGHT,
      INLINE_VIEW_MIN_HEIGHT,
    )
    if (!result) return

    const inlineView = useViewStore(iv.viewId)
    // 先更新高度（响应式触发内联 Stage 尺寸更新），再设置视口
    view.updateInlineViewSize(nodeId, rect.width, result.newHeight)
    inlineView.setViewport(result.stageX, result.stageY, result.scale)
  }

  return {
    enterNodeView,
    enterParentNodeView,
    groupSelectedNodes,
    clearNodeChildren,
    toggleInlineView,
    fitInlineView,
  }
}
