import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import { useActiveView } from '@/composables/useActiveView'
import {
  CONNECTION_TEMP_STROKE_COLOR,
  CONNECTION_TEMP_DASH,
  CONNECTION_STROKE_WIDTH,
  DEFAULT_NODE_WIDTH,
  DEFAULT_NODE_HEIGHT,
} from '@/constants'

/**
 * 连线创建交互 Composable
 *
 * 管理 Shift+点击拖拽创建连线的完整交互流程：
 * - Shift 键状态追踪
 * - 鼠标事件处理（mousedown -> 标记起始节点，mousemove -> 更新临时终点，mouseup -> 创建连线）
 * - 临时连线的 Konva 渲染配置
 *
 * 用法：
 *   const conn = useConnectionCreation()
 *   onMounted(() => conn.setup())
 *   onUnmounted(() => conn.teardown())
 *   在 Stage 上绑定 @mousedown="conn.handleMouseDown" 等事件
 */
export function useConnectionCreation() {
  const active = useActiveView()

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
      if (nodeName && active.nodeStore.nodes.has(nodeName)) {
        return nodeName
      }
      current = current.getParent()
    }
    return null
  }

  // ── 鼠标事件处理 ──

  /** Stage mousedown: Shift + 点击节点 -> 开始连线创建 */
  function handleMouseDown(e: KonvaEventObject<MouseEvent>): void {
    if (!isShiftHeld.value) return
    // 仅响应左键
    if (e.evt.button !== 0) return

    const view = active.view
    const nodeStore = active.nodeStore

    // 命中已有节点 -> 以其为连线起始
    const hitNodeId = e.target !== e.currentTarget ? findNodeIdFromTarget(e.target) : null
    if (hitNodeId) {
      view.connectingFrom = hitNodeId
      return
    }

    // 起始位置无节点 -> 在指针处创建节点作为起始（中心对齐光标）
    const stage = e.target.getStage()
    const pos = stage?.getRelativePointerPosition()
    if (!pos) return
    const newId = nodeStore.addNode(
      active.project.activeViewId,
      pos.x - DEFAULT_NODE_WIDTH / 2,
      pos.y - DEFAULT_NODE_HEIGHT / 2,
    )
    view.connectingFrom = newId
  }

  /** Stage mousemove: 连线拖拽中更新临时终点 */
  function handleMouseMove(e: KonvaEventObject<MouseEvent>): void {
    if (active.view.connectingFrom === null) return

    const stage = e.target.getStage()
    if (!stage) return

    const pos = stage.getRelativePointerPosition()
    if (pos) {
      tempConnEnd.value = { x: pos.x, y: pos.y }
    }
  }

  /** Stage mouseup: 连线拖拽结束 -> 创建连线或取消 */
  function handleMouseUp(e: KonvaEventObject<MouseEvent>): void {
    const view = active.view
    const nodeStore = active.nodeStore
    const project = active.project

    if (view.connectingFrom === null) return
    if (e.evt.button !== 0) return

    const fromNodeId = view.connectingFrom
    view.connectingFrom = null
    const targetNodeId =
      e.target !== e.currentTarget ? findNodeIdFromTarget(e.target) : null

    if (targetNodeId && targetNodeId !== fromNodeId) {
      // 命中已有节点 -> 直接连线
      nodeStore.addConnection(project.activeViewId, fromNodeId, targetNodeId)
    } else if (!targetNodeId) {
      // 结束位置无节点 -> 在指针处创建节点作为结束，再连线
      const stage = e.target.getStage()
      const pos = stage?.getRelativePointerPosition()
      if (!pos) {
        tempConnEnd.value = null
        return
      }
      const newId = nodeStore.addNode(
        project.activeViewId,
        pos.x - DEFAULT_NODE_WIDTH / 2,
        pos.y - DEFAULT_NODE_HEIGHT / 2,
      )
      if (newId !== fromNodeId) {
        nodeStore.addConnection(project.activeViewId, fromNodeId, newId)
      }
    }

    tempConnEnd.value = null
  }

  // ── 临时连线渲染配置 ──

  /** 临时连线（拖拽创建中，虚线）的 Konva Line 配置 */
  const tempConnConfig = computed(() => {
    const view = active.view
    if (view.connectingFrom === null || tempConnEnd.value === null) {
      return { visible: false }
    }

    const fromNode = active.nodeStore.getNode(view.connectingFrom)
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
      if (active.view.connectingFrom !== null) {
        active.view.connectingFrom = null
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
