import { ref } from 'vue'
import type { Ref } from 'vue'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import { NODE_DRAG_THRESHOLD } from '@/constants'

/**
 * 节点拖动交互 Composable
 *
 * 以纯鼠标事件驱动节点拖拽（替代 Konva 原生 draggable），统一在
 * WhiteboardCanvas 的 Stage 事件中处理，与框选、连线创建等交互模式一致。
 *
 * 交互流程：
 *   1. handleMouseDown：检测是否点中节点，记录起点（不改变选中状态）
 *   2. handleMouseMove：移动超过阈值才激活拖动；激活时若被拖节点未选中则单选它，
 *      然后按总 delta 同步移动所有选中节点
 *   3. handleMouseUp：若未拖动（纯 click）则处理选中（单选 / Ctrl toggle）；
 *      若已拖动则仅清理状态
 *
 * 事件分流由 WhiteboardCanvas 负责：Shift 走连线创建，PanMode 走平移，
 * 命中节点走本 composable，空白走框选。
 *
 * 坐标系：stage.getRelativePointerPosition() 返回世界坐标，与 node.x/y 同系。
 */
export function useNodeDragging() {
  const active = useActiveWhiteboard()

  /** 是否正在拖动节点（已超过阈值激活） */
  const isDragging: Ref<boolean> = ref(false)

  /** mousedown 命中的节点 ID（拖动候选，未激活前不改变选中状态） */
  let pendingNodeId: string | null = null

  /** mousedown 时的世界坐标起点（用于阈值判断和 delta 计算） */
  let pendingStart: { x: number; y: number } | null = null

  /** 所有选中节点在拖动激活时的初始位置快照（用于多选同步移动） */
  let dragStartPositions: Map<string, { x: number; y: number }> = new Map()

  // ── 辅助函数 ──

  /**
   * 从事件目标向上查找所属节点的 ID
   * 遍历父节点链，找到 name 属性匹配节点 ID 的 Group
   */
  function findNodeIdFromTarget(target: Konva.Node): string | null {
    let current: Konva.Node | null = target
    while (current && current.nodeType !== 'Stage') {
      const nodeName: string = current.name()
      if (nodeName && active.board.nodes.has(nodeName)) {
        return nodeName
      }
      current = current.getParent()
    }
    return null
  }

  /** 从事件获取世界坐标 */
  function getWorldPos(e: KonvaEventObject<MouseEvent>): { x: number; y: number } | null {
    const stage = e.target.getStage()
    if (!stage) return null
    return stage.getRelativePointerPosition()
  }

  // ── 鼠标事件处理 ──

  /**
   * mousedown：检测是否点中节点，记录拖动候选。
   * @returns true 表示命中节点（已接管），false 表示非节点（交由框选处理）
   */
  function handleMouseDown(e: KonvaEventObject<MouseEvent>): boolean {
    // 仅响应左键；右键留给 contextmenu，避免右键点节点被当成 click 触发 selectNode 清空多选
    if (e.evt.button !== 0) return false
    // 空白区域（Stage 自身），交由框选
    if (e.target === e.currentTarget) return false

    const nodeId = findNodeIdFromTarget(e.target)
    if (!nodeId) return false // 非节点（如连线），不接管

    pendingNodeId = nodeId
    const pos = getWorldPos(e)
    if (!pos) {
      pendingNodeId = null
      return false
    }
    pendingStart = { x: pos.x, y: pos.y }
    return true
  }

  /** mousemove：超过阈值激活拖动，同步移动所有选中节点 */
  function handleMouseMove(e: KonvaEventObject<MouseEvent>): void {
    if (!pendingNodeId || !pendingStart) return

    const pos = getWorldPos(e)
    if (!pos) return

    // 首次移动超过阈值才激活拖动
    if (!isDragging.value) {
      const dx = Math.abs(pos.x - pendingStart.x)
      const dy = Math.abs(pos.y - pendingStart.y)
      if (dx < NODE_DRAG_THRESHOLD && dy < NODE_DRAG_THRESHOLD) return

      // 激活拖动
      isDragging.value = true

      const board = active.board
      // 若被拖节点未选中，单选它（拖动一个未选中节点意味着"我要移动这个节点"）
      if (!board.selectedNodeIds.has(pendingNodeId)) {
        board.selectNode(pendingNodeId, false)
      }
      // 记录所有选中节点初始位置（选中状态可能刚变，需在激活后快照）
      dragStartPositions.clear()
      board.selectedNodeIds.forEach((id) => {
        const n = board.nodes.get(id)
        if (n) dragStartPositions.set(id, { x: n.x, y: n.y })
      })
    }

    // 按总 delta 同步移动所有选中节点（起点固定不动，保证多选相对位置不变）
    const deltaX = pos.x - pendingStart.x
    const deltaY = pos.y - pendingStart.y
    dragStartPositions.forEach((start, id) => {
      active.board.moveNode(id, start.x + deltaX, start.y + deltaY)
    })
  }

  /** mouseup：纯 click 处理选中；拖动结束仅清理状态 */
  function handleMouseUp(e: KonvaEventObject<MouseEvent>): void {
    if (!pendingNodeId) return // 非节点拖动，不处理

    if (!isDragging.value) {
      // 纯 click（未超过阈值）：处理选中（单选 / Ctrl toggle）
      const ctrl = e.evt.ctrlKey || e.evt.metaKey
      active.board.selectNode(pendingNodeId, ctrl)
    }

    // 清理状态
    isDragging.value = false
    pendingNodeId = null
    pendingStart = null
    dragStartPositions.clear()
  }

  return { isDragging, handleMouseDown, handleMouseMove, handleMouseUp }
}
