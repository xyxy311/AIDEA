import type { KonvaEventObject } from 'konva/lib/Node'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import { useContextMenu, type ContextMenuItem } from '@/composables/useContextMenu'
import { useNodeWhiteboardLink } from '@/composables/useNodeWhiteboardLink'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'

/**
 * 画布事件处理
 *
 * 提供针对 v-stage 事件的回调：
 * - handleStageClick：点击空白区域取消选中
 * - handleStageDblClick：双击空白区域创建新节点
 * - handleStageContextMenu：右键弹出上下文菜单（按选中数量生成菜单项）
 *
 * 右键菜单内容：
 * - 单选节点：创建关联白板 / 进入关联白板（已关联时）
 * - 多选节点：组合
 */
export function useCanvasEvents() {
  const active = useActiveWhiteboard()
  const contextMenu = useContextMenu()
  const link = useNodeWhiteboardLink()

  /**
    * 处理画布点击事件
    * 当点击目标为 Stage 本身（非节点）时，取消选中
    */
  function handleStageClick(e: KonvaEventObject<MouseEvent>) {
    // Konva 中：点击空白区域时，e.target === e.currentTarget (Stage)
    if (e.target === e.currentTarget) {
      active.board.clearSelection()
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
      active.board.addNode(
        pos.x - DEFAULT_NODE_WIDTH / 2,
        pos.y - DEFAULT_NODE_HEIGHT / 2,
      )
    }
  }

  /**
    * 处理画布右键菜单事件
    *
    * 阻止浏览器默认菜单，并根据当前选中状态弹出上下文菜单：
    * - 无选中：关闭菜单
    * - 单选节点：未关联 -> 「创建关联白板」；已关联 -> 「进入白板」
    * - 多选节点：「组合」
    */
  function handleStageContextMenu(e: KonvaEventObject<MouseEvent>) {
    e.evt.preventDefault()

    const board = active.board
    const count = board.selectedNodeIds.size

    if (count === 0) {
      contextMenu.close()
      return
    }

    const items: ContextMenuItem[] = []

    if (count === 1) {
      const nodeId = board.selectedNodeId
      const node = nodeId ? board.nodes.get(nodeId) : undefined
      if (node?.hasWhiteboard) {
        items.push({
          key: 'enter-whiteboard',
          label: '进入白板',
          action: () => link.enterLinkedWhiteboard(),
        })
        if (nodeId) {
          items.push({
            key: 'delete-whiteboard',
            label: '删除关联白板',
            danger: true,
            action: () => {
                // 取消关联：删除白板子树，但保留节点本身
                active.project.removeWhiteboardWithDescendants(nodeId)
                active.board.setNodeHasWhiteboard(nodeId, false)
            },
          })
        }
      } else {
        items.push({
          key: 'create-whiteboard',
          label: '创建关联白板',
          action: () => link.createLinkedWhiteboard(),
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
