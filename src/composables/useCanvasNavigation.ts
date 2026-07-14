import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { KonvaEventObject } from 'konva/lib/Node'
import { MIN_SCALE, MAX_SCALE, ZOOM_STEP } from '@/constants'

/**
 * 画布导航（平移 + 缩放）
 *
 * 提供无限画布的平移和缩放能力：
 * - 按住空格键 + 鼠标拖拽 → 平移画布
 * - Ctrl + 滚轮 → 缩放画布（以鼠标位置为中心）
 *
 * 状态暴露：
 * - stageX / stageY：画布偏移量
 * - stageScale：当前缩放倍率
 * - isPanMode：是否处于平移模式（空格键按下）
 * - navConfig：可直接合并到 v-stage 的 :config 中
 */
export function useCanvasNavigation() {
  // ── 状态 ──
  const stageX = ref(0)
  const stageY = ref(0)
  const stageScale = ref(1)
  const isPanMode = ref(false)

  // ── 空格键处理 ──

  function onKeyDown(e: KeyboardEvent): void {
    // 只在空格键、非输入框焦点下激活平移模式
    if (e.key !== ' ') return
    if (e.repeat) return
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

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

    const oldScale = stageScale.value
    const direction = e.evt.deltaY > 0 ? -1 : 1
    const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * factor))

    if (newScale === oldScale) return

    // 计算鼠标指向的"世界坐标点"（不受缩放影响）
    const mousePointTo = {
      x: (pointer.x - stageX.value) / oldScale,
      y: (pointer.y - stageY.value) / oldScale,
    }

    stageScale.value = newScale
    stageX.value = pointer.x - mousePointTo.x * newScale
    stageY.value = pointer.y - mousePointTo.y * newScale
  }

  // ── 平移拖拽（Stage dragmove/dragend） ──

  /**
   * Stage 拖拽中同步偏移量
   * 注意：Konva 事件冒泡会导致子节点（如 WhiteboardNode）的
   * dragmove 事件也触发此回调。必须过滤 e.target === e.currentTarget
   * 确保只在 Stage 自身被拖拽时更新偏移量。
   */
  function handleDragMove(e: KonvaEventObject<DragEvent>): void {
    if (e.target !== e.currentTarget) return
    stageX.value = e.target.x()
    stageY.value = e.target.y()
  }

  /**
   * Stage 拖拽结束同步偏移量
   * 同上，需过滤子节点冒泡事件。
   */
  function handleDragEnd(e: KonvaEventObject<DragEvent>): void {
    if (e.target !== e.currentTarget) return
    stageX.value = e.target.x()
    stageY.value = e.target.y()
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

  // ── 合并到 Stage config 的计算属性 ──

  const navConfig = computed(() => ({
    x: stageX.value,
    y: stageY.value,
    scaleX: stageScale.value,
    scaleY: stageScale.value,
    draggable: isPanMode.value,
  }))

  return {
    // 状态（只读意图，但 ref 是可写的，组件可通过 .value 修改）
    stageX,
    stageY,
    stageScale,
    isPanMode,
    // 事件处理器
    handleWheel,
    handleDragMove,
    handleDragEnd,
    // Stage config 合并对象
    navConfig,
  }
}
