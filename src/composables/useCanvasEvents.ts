import type { KonvaEventObject } from 'konva/lib/Node'
import { useActiveView } from '@/composables/useActiveView'
import { useContextMenu, type ContextMenuItem } from '@/composables/useContextMenu'
import { useNodeViewLink } from '@/composables/useNodeViewLink'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'

/**
 * 画布事件处理
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
export function useCanvasEvents() {
  const active = useActiveView()
  const contextMenu = useContextMenu()
  const link = useNodeViewLink()

  /**
   * 处理画布点击事件
   * 当点击目标为 Stage 本身（非节点）时，取消选中
   */
  function handleStageClick(e: KonvaEventObject<MouseEvent>) {
    // Konva 中：点击空白区域时，e.target === e.currentTarget (Stage)
    if (e.target === e.currentTarget) {
      active.view.clearSelection()
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
      const newId = active.nodeStore.addNode(
        active.project.activeViewId,
        pos.x - DEFAULT_NODE_WIDTH / 2,
        pos.y - DEFAULT_NODE_HEIGHT / 2,
      )
      // 新建后选中并进入编辑态（数据与视图状态分离，需手动编排）
      const view = active.view
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

    const view = active.view
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
      // 有子节点时提供"清空子级"（删除子树，保留节点本身）
      if (nodeId && active.nodeStore.hasChildren(nodeId)) {
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
