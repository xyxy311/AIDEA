import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  useStageSize,
  registerStageContainer,
  unregisterStageContainer,
} from '@/composables/useStageSize'

// Mock @vueuse/core before the module is loaded
vi.mock('@vueuse/core', () => ({
  useWindowSize: () => ({
    width: { value: 1280 },
    height: { value: 720 },
  }),
}))

// happy-dom 无 ResizeObserver：可捕获回调的最小实现
class MockResizeObserver {
  static last: MockResizeObserver | null = null
  callback: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb
    MockResizeObserver.last = this
  }
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

/** 构造带实测尺寸的容器元素（happy-dom 无布局引擎，直接定义 client 尺寸） */
function makeEl(width: number, height: number): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'clientWidth', { value: width })
  Object.defineProperty(el, 'clientHeight', { value: height })
  return el
}

afterEach(() => {
  // 模块级单例状态不能泄漏到其他用例
  unregisterStageContainer()
})

describe('useStageSize', () => {
  it('未注册容器时回退为窗口估算（减顶部条高度）', () => {
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

  it('注册容器后返回实测尺寸', () => {
    registerStageContainer(makeEl(900, 500))
    const { stageWidth, stageHeight } = useStageSize()
    expect(stageWidth.value).toBe(900)
    expect(stageHeight.value).toBe(500)
  })

  it('ResizeObserver 回调更新尺寸（侧边栏开合 / 窗口缩放）', () => {
    registerStageContainer(makeEl(900, 500))
    const { stageWidth, stageHeight } = useStageSize()
    expect(stageWidth.value).toBe(900)

    const ro = MockResizeObserver.last
    expect(ro).not.toBeNull()
    const entry = {
      contentRect: { width: 640, height: 480 },
    } as unknown as ResizeObserverEntry
    ro!.callback([entry], ro as unknown as ResizeObserver)

    expect(stageWidth.value).toBe(640)
    expect(stageHeight.value).toBe(480)
  })

  it('注销后回退到窗口估算', () => {
    registerStageContainer(makeEl(900, 500))
    unregisterStageContainer()
    const { stageWidth, stageHeight } = useStageSize()
    expect(stageWidth.value).toBe(1280)
    expect(stageHeight.value).toBe(636)
  })
})
