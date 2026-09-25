import { onMounted, onUnmounted, ref } from 'vue'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useViewStore } from '@/stores/view'
import { useModalStore } from '@/stores/modal'
import { MIN_SCALE, MAX_SCALE, ZOOM_STEP } from '@/constants'

/**
 * 画布导航（平移 + 缩放）：空格键 + 拖拽平移，Ctrl + 滚轮以鼠标为中心缩放。
 * 导航状态存于 viewStore，供 RightTopBar 读取视口计算"视口中央"的世界坐标。
 */
export function useCanvasNavigation(viewId: string) {
  const view = useViewStore(viewId)
  const modalStore = useModalStore()
  const isPanMode = ref(false)

  // ── 空格键处理 ──

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== ' ') return
    if (e.repeat) return
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    // 模态打开 = 独占交互：不进入平移模式
    if (modalStore.hasOpenModal) return

    e.preventDefault()
    isPanMode.value = true
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.key === ' ') {
      isPanMode.value = false
    }
  }

  /** 窗口失焦时重置平移模式，避免卡在平移状态 */
  function onBlur(): void {
    isPanMode.value = false
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

    const oldScale = view.stageScale
    const direction = e.evt.deltaY > 0 ? -1 : 1
    const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * factor))

    if (newScale === oldScale) return

    // 计算鼠标指向的"世界坐标点"（不受缩放影响）
    const mousePointTo = {
      x: (pointer.x - view.stageX) / oldScale,
      y: (pointer.y - view.stageY) / oldScale,
    }

    view.stageScale = newScale
    view.stageX = pointer.x - mousePointTo.x * newScale
    view.stageY = pointer.y - mousePointTo.y * newScale
  }

  // ── 平移拖拽（Stage dragmove/dragend） ──

  /**
   * Stage 拖拽中同步偏移量
   * 注意：Konva 事件冒泡会导致子节点的 dragmove 也触发此回调，
   * 必须过滤 e.target === e.currentTarget 以确保只在 Stage 自身拖拽时更新。
   */
  function handleDragMove(e: KonvaEventObject<DragEvent>): void {
    if (e.target !== e.currentTarget) return
    view.stageX = e.target.x()
    view.stageY = e.target.y()
  }

  /**
   * Stage 拖拽结束同步偏移量
   * 同上，需过滤子节点冒泡事件。
   */
  function handleDragEnd(e: KonvaEventObject<DragEvent>): void {
    if (e.target !== e.currentTarget) return
    view.stageX = e.target.x()
    view.stageY = e.target.y()
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
    isPanMode,
    handleWheel,
    handleDragMove,
    handleDragEnd,
  }
}
