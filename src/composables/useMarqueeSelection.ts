import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import {
  MARQUEE_FILL_COLOR,
  MARQUEE_STROKE_COLOR,
  MARQUEE_STROKE_DASH,
  MARQUEE_STROKE_WIDTH,
  MARQUEE_ACTIVATE_THRESHOLD,
} from '@/constants'

/** 框选矩形 Konva 配置 */
interface MarqueeRectConfig {
  x: number
  y: number
  width: number
  height: number
  fill: string
  stroke: string
  strokeWidth: number
  dash: number[]
  listening: false
  visible: true
}

/** 空配置（非框选时） */
const INVISIBLE_CONFIG = { visible: false } as const

/**
 * 框选（Marquee Selection）交互 Composable
 *
 * 交互流程：
 *   1. handleMouseDown：在 Stage 空白处按下，记录起点（暂不激活）
 *   2. handleMouseMove：移动超过阈值才激活框选并绘制矩形
 *   3. handleMouseUp：对相交节点做 AABB 命中检测，批量选中；清空状态
 *
 * 事件分流由 WhiteboardCanvas 负责：Shift 模式走连线创建，PanMode 走平移，其余空白走框选。
 *
 * 坐标系：stage.getRelativePointerPosition() 返回世界坐标，与 node.x/y 同系，直接做 AABB。
 *
 * 响应式注意：startPoint / currentPoint 必须是 ref，否则 marqueeRectConfig（computed）
 * 无法追踪其变化，框选框将不会随鼠标实时更新。
 */
export function useMarqueeSelection() {
  const active = useActiveWhiteboard()

  /** 是否正在框选（已超过阈值激活） */
  const isMarqueeDragging: Ref<boolean> = ref(false)

  /**
   * 框选命中后置 true，供 WhiteboardCanvas 的 click 处理器跳过 clearSelection，
   * 防止"框选选中 -> mouseup -> click 触发 clearSelection 清空"的竞态。
   * click 处理器读取后应立即重置为 false。
   */
  const suppressNextClick: Ref<boolean> = ref(false)

  /** mousedown 记录的起点（世界坐标），仅用于阈值判断，不驱动渲染，无需响应式 */
  let pendingStart: { x: number; y: number } | null = null

  /** 框选起点（世界坐标），驱动 marqueeRectConfig 渲染，必须响应式 */
  const startPoint: Ref<{ x: number; y: number } | null> = ref(null)

  /** 框选当前点（世界坐标），驱动 marqueeRectConfig 渲染，必须响应式 */
  const currentPoint: Ref<{ x: number; y: number } | null> = ref(null)

  /** 从事件获取世界坐标 */
  function getWorldPos(e: KonvaEventObject<MouseEvent>): { x: number; y: number } | null {
    const stage = e.target.getStage()
    if (!stage) return null
    // getRelativePointerPosition 返回世界坐标（已考虑 Stage 的 scale/offset）
    return stage.getRelativePointerPosition()
  }

  /** 框选矩形渲染配置（标准化为正宽高） */
  const marqueeRectConfig: ComputedRef<MarqueeRectConfig | typeof INVISIBLE_CONFIG> = computed(() => {
    if (!isMarqueeDragging.value || !startPoint.value || !currentPoint.value) {
      return INVISIBLE_CONFIG
    }
    const x = Math.min(startPoint.value.x, currentPoint.value.x)
    const y = Math.min(startPoint.value.y, currentPoint.value.y)
    const width = Math.abs(currentPoint.value.x - startPoint.value.x)
    const height = Math.abs(currentPoint.value.y - startPoint.value.y)
    return {
      x,
      y,
      width,
      height,
      fill: MARQUEE_FILL_COLOR,
      stroke: MARQUEE_STROKE_COLOR,
      strokeWidth: MARQUEE_STROKE_WIDTH,
      dash: MARQUEE_STROKE_DASH,
      listening: false,
      visible: true,
    }
  })

  /**
   * mousedown：仅在 Stage 空白处（e.target === e.currentTarget）记录起点
   * 注意：不在此处清空选中，由 click 处理器负责单击取消选中
   */
  function handleMouseDown(e: KonvaEventObject<MouseEvent>): void {
    // 仅响应空白区域（target === currentTarget 即 Stage 本身）
    if (e.target !== e.currentTarget) return
    const pos = getWorldPos(e)
    if (!pos) return
    pendingStart = { x: pos.x, y: pos.y }
    startPoint.value = { x: pos.x, y: pos.y }
    currentPoint.value = { x: pos.x, y: pos.y }
  }

  /** mousemove：超过阈值激活框选，更新当前点 */
  function handleMouseMove(e: KonvaEventObject<MouseEvent>): void {
    if (!pendingStart) return
    const pos = getWorldPos(e)
    if (!pos) return
    currentPoint.value = { x: pos.x, y: pos.y }

    // 首次移动超过阈值才激活框选
    if (!isMarqueeDragging.value) {
      const dx = Math.abs(pos.x - pendingStart.x)
      const dy = Math.abs(pos.y - pendingStart.y)
      if (dx > MARQUEE_ACTIVATE_THRESHOLD || dy > MARQUEE_ACTIVATE_THRESHOLD) {
        isMarqueeDragging.value = true
        suppressNextClick.value = true
      } else {
        return
      }
    }
  }

  /** mouseup：框选命中检测 -> 批量选中；清空状态 */
  function handleMouseUp(e: KonvaEventObject<MouseEvent>): void {
    const wasDragging = isMarqueeDragging.value

    if (wasDragging && startPoint.value && currentPoint.value) {
      const selBox = {
        x: Math.min(startPoint.value.x, currentPoint.value.x),
        y: Math.min(startPoint.value.y, currentPoint.value.y),
        width: Math.abs(currentPoint.value.x - startPoint.value.x),
        height: Math.abs(currentPoint.value.y - startPoint.value.y),
      }

      // AABB 命中检测：框选矩形与节点矩形相交则选中
      const hitIds: string[] = []
      for (const node of active.board.nodesArray) {
        if (
          selBox.x < node.x + node.width &&
          selBox.x + selBox.width > node.x &&
          selBox.y < node.y + node.height &&
          selBox.y + selBox.height > node.y
        ) {
          hitIds.push(node.id)
        }
      }

      // Ctrl/Cmd 追加到现有选中；否则替换
      const additive = e.evt.ctrlKey || e.evt.metaKey
      active.board.setSelectedNodes(hitIds, additive)
    }

    // 清空状态（无论是否激活框选，mouseup 都要重置 pendingStart）
    isMarqueeDragging.value = false
    pendingStart = null
    startPoint.value = null
    currentPoint.value = null
  }

  return {
    isMarqueeDragging,
    marqueeRectConfig,
    suppressNextClick,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  }
}
