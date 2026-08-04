import type { KonvaEventObject } from 'konva/lib/Node'
import { useViewStore } from '@/stores/view'
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useCommands } from '@/composables/useCommands'
import { useContextMenu, type ContextMenuItem } from '@/composables/useContextMenu'
import { useNodeViewLink } from '@/composables/useNodeViewLink'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT, INLINE_VIEW_DEFAULT_WIDTH, INLINE_VIEW_DEFAULT_HEIGHT } from '@/constants'
import { generateId } from '@/utils/id'

/**
 * 画布事件处理
 *
 * @param viewId - 视图 ID（主视图传 'main'）
 *
 * 提供针对 v-stage 事件的回调：
 * - handleStageClick：点击空白区域取消选中
 * - handleStageDblClick：双击空白区域创建新节点（并进入编辑态）
 * - handleStageContextMenu：右键弹出上下文菜单（按选中数量生成菜单项）
 *
 * 右键菜单内容：
 * - 单选节点：进入子视图 / 清空子级（有子节点时）
 * - 多选节点：组合
 */
export function useCanvasEvents(viewId: string) {
  const view = useViewStore(viewId)
  const nodeStore = useNodeStore()
  const project = useProjectStore()
  const contextMenu = useContextMenu()
  const link = useNodeViewLink(viewId)
  const commands = useCommands()

  /**
   * 处理画布点击事件
   * 当点击目标为 Stage 本身（非节点）时，取消选中
   */
  function handleStageClick(e: KonvaEventObject<MouseEvent>) {
    // Konva 中：点击空白区域时，e.target === e.currentTarget (Stage)
    if (e.target === e.currentTarget) {
      view.clearSelection()
    }
  }

  /**
   * 处理画布双击事件
   * 仅在空白区域双击时创建新节点（避免双击节点时误创建）
   */
  function handleStageDblClick(e: KonvaEventObject<MouseEvent>) {
    // 仅响应左键双击；右键双击留给 contextmenu，避免误触发新建节点
    if (e.evt.button !== 0) return
    // 仅在点击 Stage 空白区域时创建节点（非节点/形状之上）
    if (e.target !== e.currentTarget) {
      return
    }
    const stage = e.target.getStage()
    // getRelativePointerPosition() 返回世界坐标（已考虑 Stage 的 scale/offset）
    const pos = stage?.getRelativePointerPosition()
    if (pos) {
      // 减去半个节点尺寸，使节点的中心对齐鼠标光标位置
      const newId = commands.createNode(
        view.viewedNodeId,
        pos.x - DEFAULT_NODE_WIDTH / 2,
        pos.y - DEFAULT_NODE_HEIGHT / 2,
      )
      // 新建后选中并进入编辑态（数据与视图状态分离，需手动编排）
      view.selectNode(newId)
      view.startEditing(newId)
    }
  }

  /**
   * 处理画布右键菜单事件
   *
   * 阻止浏览器默认菜单，并根据当前选中状态弹出上下文菜单：
   * - 无选中：关闭菜单
   * - 单选节点：进入子视图 / 清空子级（有子节点时）
   * - 多选节点：组合
   */
  function handleStageContextMenu(e: KonvaEventObject<MouseEvent>) {
    e.evt.preventDefault()

    const count = view.selectedNodeIds.size

    if (count === 0) {
      contextMenu.close()
      return
    }

    const items: ContextMenuItem[] = []

    if (count === 1) {
      const nodeId = view.selectedNodeId
      items.push({
        key: 'enter-view',
        label: '进入子视图',
        action: () => link.enterNodeView(),
      })
      // 主视图：提供"展开/收起内联视图"（视图操作，不入 undo）
      if (nodeId && view.type === 'main') {
        if (view.getInlineViewRect(nodeId)) {
          // 已展开 -> 收起
          items.push({
            key: 'collapse-inline',
            label: '收起内联视图',
            action: () => {
              const iv = view.inlineViews.find((v) => v.nodeId === nodeId)
              if (iv) {
                project.destroyView(iv.viewId)
                view.removeInlineView(nodeId)
              }
            },
          })
        } else {
          // 未展开 -> 展开
          items.push({
            key: 'expand-inline',
            label: '展开内联视图',
            action: () => {
              const inlineViewId = generateId()
              useViewStore(inlineViewId, {
                nodeId,
                type: 'inline',
                hostViewId: viewId,
              })
              view.addInlineView(
                nodeId,
                inlineViewId,
                INLINE_VIEW_DEFAULT_WIDTH,
                INLINE_VIEW_DEFAULT_HEIGHT,
              )
            },
          })
        }
      }
      // 有子节点时提供"清空子级"（删除子树，保留节点本身）
      if (nodeId && nodeStore.hasChildren(nodeId)) {
        items.push({
          key: 'clear-children',
          label: '清空子级',
          danger: true,
          action: () => {
            if (nodeId) link.clearNodeChildren(nodeId)
          },
        })
      }
    } else {
      items.push({
        key: 'group',
        label: '组合',
        action: () => link.groupSelectedNodes(),
      })
    }

    contextMenu.open(e.evt.clientX, e.evt.clientY, items)
  }

  return {
    handleStageClick,
    handleStageDblClick,
    handleStageContextMenu,
    /** 右键菜单状态（供画布组件渲染 ContextMenu） */
    contextMenu,
  }
}
