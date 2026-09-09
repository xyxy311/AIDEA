import { computed, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { TOOLBAR_HEIGHT, MENU_BAR_HEIGHT } from '@/constants'

/**
 * 主画布容器的实测尺寸（模块级单例，由主视图 CanvasStage 注册）。
 * 为 null 时回退到"窗口尺寸 - 顶部图标条高度"的估算（组件未挂载 / 测试环境）。
 */
const measuredWidth = ref<number | null>(null)
const measuredHeight = ref<number | null>(null)

let observer: ResizeObserver | null = null
let observedEl: HTMLElement | null = null

/** 注销当前观察的画布容器，尺寸回退到窗口估算 */
export function unregisterStageContainer(): void {
  observer?.disconnect()
  observer = null
  observedEl = null
  measuredWidth.value = null
  measuredHeight.value = null
}

/**
 * 注册主画布容器：用 ResizeObserver 跟踪真实布局尺寸。
 * 画布真实宽度 = 窗口宽 - 活动栏 - 左右侧边栏 - handle（flex 实体排布），
 * 而非整个窗口；侧边栏开合、拖拽调宽、窗口缩放均会实时反映。
 * 仅主视图 CanvasStage 调用；重复注册会先注销上一个。
 */
export function registerStageContainer(el: HTMLElement): void {
  if (observedEl === el) return
  unregisterStageContainer()
  observedEl = el
  measuredWidth.value = el.clientWidth
  measuredHeight.value = el.clientHeight
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    measuredWidth.value = entry.contentRect.width
    measuredHeight.value = entry.contentRect.height
  })
  observer.observe(el)
}

/**
 * 响应式画布尺寸
 * 优先使用实测的主画布容器尺寸（registerStageContainer 注册），
 * 未注册时回退为窗口尺寸估算（仅减顶部条高度）。
 */
export function useStageSize() {
  const { width: windowWidth, height: windowHeight } = useWindowSize()

  const stageWidth = computed(() => measuredWidth.value ?? windowWidth.value)
  const stageHeight = computed(
    () => measuredHeight.value ?? windowHeight.value - TOOLBAR_HEIGHT - MENU_BAR_HEIGHT,
  )

  return { stageWidth, stageHeight }
}
