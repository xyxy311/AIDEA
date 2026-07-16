import { computed } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { TOOLBAR_HEIGHT, MENU_BAR_HEIGHT } from '@/constants'

/**
 * 响应式画布尺寸
 * 根据窗口大小动态计算，减去顶部菜单栏和工具栏高度
 */
export function useStageSize() {
  const { width: windowWidth, height: windowHeight } = useWindowSize()

  const stageWidth = computed(() => windowWidth.value)
  const stageHeight = computed(() => windowHeight.value - TOOLBAR_HEIGHT - MENU_BAR_HEIGHT)

  return { stageWidth, stageHeight }
}
