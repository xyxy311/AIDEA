import { onMounted, onUnmounted } from 'vue'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useWhiteboardStore } from '@/stores/whiteboard'
import { MIN_SCALE, MAX_SCALE, ZOOM_STEP } from '@/constants'

/**
 * 画布导航（平移 + 缩放）
 *
 * 提供无限画布的平移和缩放能力：
 * - 按住空格键 + 鼠标拖拽 → 平移画布
 * - Ctrl + 滚轮 → 缩放画布（以鼠标位置为中心）
 *
 * 导航状态存储在 Pinia store 中，以便 Toolbar 等组件
 * 读取当前视口状态来计算"视口中央"的世界坐标。
 */
export function useCanvasNavigation() {
  const store = useWhiteboardStore()

  // ── 空格键处理 ──

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== ' ') return
    if (e.repeat) return
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    e.preventDefault()
    store.isPanMode = true
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.key === ' ') {
      store.isPanMode = false
    }
  }

  /** 窗口失焦时重置平移模式，避免卡在平移状态 */
  function onBlur(): void {
    store.isPanMode = false
  }

  // ── 滚轮缩放（Ctrl + 滚轮） ──

  /**
   * 以鼠标位置为中心缩放 Stage
   * 仅在 Ctrl 键按下时响应滚轮事件
   */
  function handleWheel(e: KonvaEventObject<WheelEvent>): void {
    if (!e.evt.ctrlKey) return
    e.evt.preventDefault()

    const stage = e.target.getStage()
    if (!stage) return

    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const oldScale = store.stageScale
    const direction = e.evt.deltaY > 0 ? -1 : 1
    const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * factor))

    if (newScale === oldScale) return

    // 计算鼠标指向的"世界坐标点"（不受缩放影响）
    const mousePointTo = {
      x: (pointer.x - store.stageX) / oldScale,
      y: (pointer.y - store.stageY) / oldScale,
    }

    store.stageScale = newScale
    store.stageX = pointer.x - mousePointTo.x * newScale
    store.stageY = pointer.y - mousePointTo.y * newScale
  }

  // ── 平移拖拽（Stage dragmove/dragend） ──

  /**
   * Stage 拖拽中同步偏移量
   * 注意：Konva 事件冒泡会导致子节点的 dragmove 也触发此回调，
   * 必须过滤 e.target === e.currentTarget 以确保只在 Stage 自身拖拽时更新。
   */
  function handleDragMove(e: KonvaEventObject<DragEvent>): void {
    if (e.target !== e.currentTarget) return
    store.stageX = e.target.x()
    store.stageY = e.target.y()
  }

  /**
   * Stage 拖拽结束同步偏移量
   * 同上，需过滤子节点冒泡事件。
   */
  function handleDragEnd(e: KonvaEventObject<DragEvent>): void {
    if (e.target !== e.currentTarget) return
    store.stageX = e.target.x()
    store.stageY = e.target.y()
  }

  // ── 生命周期 ──

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
  })

  return {
    handleWheel,
    handleDragMove,
    handleDragEnd,
  }
}
