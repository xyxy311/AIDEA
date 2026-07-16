import { describe, it, expect, vi } from 'vitest'
import { useStageSize } from '@/composables/useStageSize'

// Mock @vueuse/core before the module is loaded
vi.mock('@vueuse/core', () => ({
  useWindowSize: () => ({
    width: { value: 1280 },
    height: { value: 720 },
  }),
}))

describe('useStageSize', () => {
  it('should return stage dimensions accounting for toolbar and menu bar height', () => {
    const { stageWidth, stageHeight } = useStageSize()
    // 1280 window width, 720 window height, minus 56px toolbar + 28px menu bar
    expect(stageWidth.value).toBe(1280)
    expect(stageHeight.value).toBe(720 - 56 - 28) // 636
  })

  it('should return reactive refs', () => {
    const { stageWidth, stageHeight } = useStageSize()
    expect(stageWidth).toHaveProperty('value')
    expect(stageHeight).toHaveProperty('value')
  })
})
