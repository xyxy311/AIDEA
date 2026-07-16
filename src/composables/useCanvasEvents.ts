import type { KonvaEventObject } from 'konva/lib/Node'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'

/**
 * 画布事件处理
 *
 * 提供针对 v-stage 事件的回调：
 * - handleStageClick：点击空白区域取消选中
 * - handleStageDblClick：双击空白区域创建新节点
 * - handleStageContextMenu：右键菜单（阻止默认）
 */
export function useCanvasEvents() {
  const active = useActiveWhiteboard()

  /**
   * 处理画布点击事件
   * 当点击目标为 Stage 本身（非节点）时，取消选中
   */
  function handleStageClick(e: KonvaEventObject<MouseEvent>) {
    // Konva 中：点击空白区域时，e.target === e.currentTarget (Stage)
    if (e.target === e.currentTarget) {
      active.board.selectNode(null)
    }
  }

  /**
   * 处理画布双击事件
   * 仅在空白区域双击时创建新节点（避免双击节点时误创建）
   */
  function handleStageDblClick(e: KonvaEventObject<MouseEvent>) {
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
   * 处理画布右键菜单事件（阻止浏览器默认菜单）
   */
  function handleStageContextMenu(e: KonvaEventObject<MouseEvent>) {
    // 调试：打印信息
    // console.log('画布偏移:', active.board.stageX, active.board.stageY)
    // console.log('画布缩放:', active.board.stageScale)
    // console.log('所有节点坐标:', [...active.board.nodes.values()])
    console.log('当前白板：', active.board.whiteboardId)
    e.evt.preventDefault()
  }

  return {
    handleStageClick,
    handleStageDblClick,
    handleStageContextMenu,
  }
}
