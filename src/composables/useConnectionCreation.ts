import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import { useViewStore } from '@/stores/view'
import { useNodeStore } from '@/stores/node'
import { useThemeStore } from '@/stores/theme'
import { useCommands } from '@/composables/useCommands'
import {
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
 * @param viewId - 视图 ID（主视图传 'main'）
 *
 * 用法：
 *   const conn = useConnectionCreation(viewId)
 *   onMounted(() => conn.setup())
 *   onUnmounted(() => conn.teardown())
 *   在 Stage 上绑定 @mousedown="conn.handleMouseDown" 等事件
 */
export function useConnectionCreation(viewId: string) {
  const view = useViewStore(viewId)
  const nodeStore = useNodeStore()
  const theme = useThemeStore()
  const commands = useCommands()

  /** Shift 键是否按下 */
  const isShiftHeld = ref(false)

  /** 连线拖拽时鼠标位置（临时连线终点） */
  const tempConnEnd = ref<{ x: number; y: number } | null>(null)

  /** 标记起始节点是否为本次新建（用于 batch 合并） */
  let startNodeCreated = false

  // ── 辅助函数 ──

  /**
   * 从事件目标向上查找所属节点的 ID
   * 遍历父节点链，找到 name 属性匹配节点 ID 的 Group
   */
  function findNodeIdFromTarget(target: Konva.Node): string | null {
    let current: Konva.Node | null = target
    while (current && current.nodeType !== 'Stage') {
      const nodeName: string = current.name()
      if (nodeName && nodeStore.nodes.has(nodeName)) {
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

    // 命中已有节点 -> 以其为连线起始
    const hitNodeId = e.target !== e.currentTarget ? findNodeIdFromTarget(e.target) : null
    if (hitNodeId) {
      view.connectingFrom = hitNodeId
      startNodeCreated = false
      window.addEventListener('mouseup', onWindowMouseUp, { once: true })
      return
    }

    // 起始位置无节点 -> 在指针处创建节点作为起始（中心对齐光标）
    const stage = e.target.getStage()
    const pos = stage?.getRelativePointerPosition()
    if (!pos) return
    // 开启 batch，起始节点入 batch（后续 mouseup 时合并为单条历史）
    commands.beginBatch()
    const newId = commands.createNode(
      view.viewedNodeId,
      pos.x - DEFAULT_NODE_WIDTH / 2,
      pos.y - DEFAULT_NODE_HEIGHT / 2,
    )
    view.connectingFrom = newId
    startNodeCreated = true
    window.addEventListener('mouseup', onWindowMouseUp, { once: true })
  }

  /** Stage mousemove: 连线拖拽中更新临时终点 */
  function handleMouseMove(e: KonvaEventObject<MouseEvent>): void {
    if (view.connectingFrom === null) return

    const stage = e.target.getStage()
    if (!stage) return
    const pos = stage.getRelativePointerPosition()
    if (pos) {
      tempConnEnd.value = { x: pos.x, y: pos.y }
    }
  }

  /** Stage mouseup: 连线拖拽结束 -> 创建连线或取消 */
  function handleMouseUp(e: KonvaEventObject<MouseEvent>): void {
    if (view.connectingFrom === null) return
    if (e.evt.button !== 0) return

    const fromNodeId = view.connectingFrom
    view.connectingFrom = null
    const targetNodeId =
      e.target !== e.currentTarget ? findNodeIdFromTarget(e.target) : null

    // 若起始节点不是新建的（batch 未开启），确保 batch 开启以合并本次操作
    if (!startNodeCreated) {
      commands.beginBatch()
    }
    let connId: string | null = null
    if (targetNodeId && targetNodeId !== fromNodeId) {
      // 命中已有节点 -> 直接连线
      connId = commands.addConnection(view.viewedNodeId, fromNodeId, targetNodeId)
    } else if (!targetNodeId) {
      // 结束位置无节点 -> 在指针处创建节点作为结束，再连线
      const stage = e.target.getStage()
      const pos = stage?.getRelativePointerPosition()
      if (!pos) {
        tempConnEnd.value = null
        commands.rollbackBatch()
        startNodeCreated = false
        return
      }
      const newId = commands.createNode(
        view.viewedNodeId,
        pos.x - DEFAULT_NODE_WIDTH / 2,
        pos.y - DEFAULT_NODE_HEIGHT / 2,
      )
      if (newId !== fromNodeId) {
        connId = commands.addConnection(view.viewedNodeId, fromNodeId, newId)
      }
    }
    if (connId) {
      view.selectConnection(connId)
    }
    
    // 提交复合命令（创建节点 + 创建连线合并为单条历史）
    commands.commitBatch()
    startNodeCreated = false
    tempConnEnd.value = null
  }

  /**
   * window mouseup 兜底：鼠标移出 Stage 松手时取消连线创建。
   * stage mouseup 已处理时（connectingFrom 已清）幂等返回。
   */
  function onWindowMouseUp(): void {
    if (view.connectingFrom === null) return
    if (startNodeCreated) {
      commands.rollbackBatch()
      startNodeCreated = false
    }
    view.connectingFrom = null
    tempConnEnd.value = null
  }

  // ── 临时连线渲染配置 ──

  /** 临时连线（拖拽创建中，虚线）的 Konva Line 配置 */
  const tempConnConfig = computed(() => {
    if (view.connectingFrom === null || tempConnEnd.value === null) {
      return { visible: false }
    }

    const fromNode = nodeStore.getNode(view.connectingFrom)
    if (!fromNode) return { visible: false }

    return {
      points: [
        fromNode.x + fromNode.width / 2,
        fromNode.y + fromNode.height / 2,
        tempConnEnd.value.x,
        tempConnEnd.value.y,
      ],
      stroke: theme.scheme.canvas.connectionTemp,
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
      if (view.connectingFrom !== null) {
        // 若起始节点是新建的且操作未完成，回滚 batch（丢弃历史，不删已创建节点）
        if (startNodeCreated) {
          commands.rollbackBatch()
          startNodeCreated = false
        }
        view.connectingFrom = null
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
