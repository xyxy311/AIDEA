import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import {
  CONNECTION_TEMP_STROKE_COLOR,
  CONNECTION_TEMP_DASH,
  CONNECTION_STROKE_WIDTH,
} from '@/constants'

/**
 * 连线创建交互 Composable
 *
 * 管理 Shift+点击拖拽创建连线的完整交互流程：
 * - Shift 键状态追踪
 * - 鼠标事件处理（mousedown → 标记起始节点，mousemove → 更新临时终点，mouseup → 创建连线）
 * - 临时连线的 Konva 渲染配置
 *
 * 用法：
 *   const conn = useConnectionCreation()
 *   onMounted(() => conn.setup())
 *   onUnmounted(() => conn.teardown())
 *   在 Stage 上绑定 @mousedown="conn.handleMouseDown" 等事件
 */
export function useConnectionCreation() {
  const active = useActiveWhiteboard()

  /** Shift 键是否按下 */
  const isShiftHeld = ref(false)

  /** 连线拖拽时鼠标位置（临时连线终点） */
  const tempConnEnd = ref<{ x: number; y: number } | null>(null)

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

  // ── 鼠标事件处理 ──

  /** Stage mousedown: Shift + 点击节点 → 开始连线创建 */
  function handleMouseDown(e: KonvaEventObject<MouseEvent>): void {
    if (!isShiftHeld.value) return
    if (e.target === e.currentTarget) return // 点击空白区域，忽略

    const nodeId = findNodeIdFromTarget(e.target)
    if (!nodeId) return

    active.board.connectingFrom = nodeId
  }

  /** Stage mousemove: 连线拖拽中更新临时终点 */
  function handleMouseMove(e: KonvaEventObject<MouseEvent>): void {
    if (active.board.connectingFrom === null) return

    const stage = e.target.getStage()
    if (!stage) return

    const pos = stage.getRelativePointerPosition()
    if (pos) {
      tempConnEnd.value = { x: pos.x, y: pos.y }
    }
  }

  /** Stage mouseup: 连线拖拽结束 → 创建连线或取消 */
  function handleMouseUp(e: KonvaEventObject<MouseEvent>): void {
    if (active.board.connectingFrom === null) return

    const fromNodeId = active.board.connectingFrom
    active.board.connectingFrom = null
    const targetNodeId =
      e.target !== e.currentTarget ? findNodeIdFromTarget(e.target) : null

    if (targetNodeId && targetNodeId !== fromNodeId) {
      active.board.addConnection(fromNodeId, targetNodeId)
    }

    tempConnEnd.value = null
  }

  // ── 临时连线渲染配置 ──

  /** 临时连线（拖拽创建中，虚线）的 Konva Line 配置 */
  const tempConnConfig = computed(() => {
    if (active.board.connectingFrom === null || tempConnEnd.value === null) {
      return { visible: false }
    }

    const fromNode = active.board.nodes.get(active.board.connectingFrom)
    if (!fromNode) return { visible: false }

    return {
      points: [
        fromNode.x + fromNode.width / 2,
        fromNode.y + fromNode.height / 2,
        tempConnEnd.value.x,
        tempConnEnd.value.y,
      ],
      stroke: CONNECTION_TEMP_STROKE_COLOR,
      strokeWidth: CONNECTION_STROKE_WIDTH,
      dash: CONNECTION_TEMP_DASH,
      listening: false,
      hitStrokeWidth: 0,
    }
  })

  // ── Shift 键状态 ──

  function handleWindowKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Shift' && !e.repeat) {
      isShiftHeld.value = true
    }
  }

  function handleWindowKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Shift') {
      isShiftHeld.value = false
      // Shift 释放时取消连线创建
      if (active.board.connectingFrom !== null) {
        active.board.connectingFrom = null
        tempConnEnd.value = null
      }
    }
  }

  /** 注册全局键盘事件 */
  function setup(): void {
    window.addEventListener('keydown', handleWindowKeyDown)
    window.addEventListener('keyup', handleWindowKeyUp)
  }

  /** 注销全局键盘事件 */
  function teardown(): void {
    window.removeEventListener('keydown', handleWindowKeyDown)
    window.removeEventListener('keyup', handleWindowKeyUp)
  }

  onMounted(() => {
    setup()
  })

  onUnmounted(() => {
    teardown()
  })

  return {
    isShiftHeld,
    tempConnEnd,
    tempConnConfig,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    setup,
    teardown,
  }
}
