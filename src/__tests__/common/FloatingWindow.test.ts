import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

/** 挂载（stub teleport/transition：内容留在组件树内、出入场无动画，便于同步断言） */
function mountWindow(props: { show: boolean; title?: string }) {
  return mount(FloatingWindow, {
    props,
    global: { stubs: { teleport: true, transition: true } },
  })
}

/** FloatingWindow 通用窗口壳冒烟：props 驱动显隐、把手条/标题、拖拽偏移与卸载重置 */
describe('FloatingWindow（通用浮动窗口壳）挂载冒烟', () => {
  it('show=false 不渲染窗口；show=true 渲染窗口 + 把手条 + 标题文本', () => {
    const hidden = mountWindow({ show: false, title: '演示浮窗' })
    expect(hidden.find('.plugin-float').exists()).toBe(false)
    hidden.unmount()

    const shown = mountWindow({ show: true, title: '演示浮窗' })
    expect(shown.find('.plugin-float').exists()).toBe(true)
    expect(shown.find('.plugin-float__grip').exists()).toBe(true)
    expect(shown.find('.plugin-float__title').text()).toBe('演示浮窗')
    shown.unmount()
  })

  it('title 缺省：窗口与把手条渲染，但不渲染标题文本（把手条只有拖拽面）', () => {
    const wrapper = mountWindow({ show: true })
    expect(wrapper.find('.plugin-float').exists()).toBe(true)
    expect(wrapper.find('.plugin-float__grip').exists()).toBe(true)
    expect(wrapper.find('.plugin-float__title').exists()).toBe(false)
    wrapper.unmount()
  })

  it('show 由使用方驱动：true → false 窗口卸载（转场 stub 下同步卸载）', async () => {
    const wrapper = mountWindow({ show: true })
    expect(wrapper.find('.plugin-float').exists()).toBe(true)

    await wrapper.setProps({ show: false })
    expect(wrapper.find('.plugin-float').exists()).toBe(false)
    wrapper.unmount()
  })

  it('把手条拖动：pointerdown/move 更新偏移（CSS 变量叠加视口中心），pointerup 后停止', async () => {
    const wrapper = mountWindow({ show: true })
    const grip = wrapper.find('.plugin-float__grip')
    // happy-dom 环境无 pointer capture 实现，mock 掉（组件内仅调用不消费返回值）
    grip.element.setPointerCapture = vi.fn()

    await grip.trigger('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
    await grip.trigger('pointermove', { clientX: 150, clientY: 120, pointerId: 1 })

    const style = wrapper.find('.plugin-float').attributes('style') ?? ''
    expect(style).toContain('--float-x: 50px')
    expect(style).toContain('--float-y: 20px')

    // pointerup 结束拖动：后续 move 不再更新偏移
    await grip.trigger('pointerup', { pointerId: 1 })
    await grip.trigger('pointermove', { clientX: 999, clientY: 999, pointerId: 1 })
    const styleAfter = wrapper.find('.plugin-float').attributes('style') ?? ''
    expect(styleAfter).toContain('--float-x: 50px')
    expect(styleAfter).toContain('--float-y: 20px')
    wrapper.unmount()
  })
})

/**
 * 越界钳制（clamp）用例组。
 *
 * happy-dom 无布局引擎：offsetWidth/offsetHeight 恒为 0 → 经 prototype 级 defineProperty
 * mock 出窗口尺寸（对重建的窗口元素同样生效）；视口经 window.innerWidth/innerHeight
 * 的实例属性覆盖 mock（happy-dom 实例按测试文件隔离，无跨文件泄漏）。
 * clamp 纯函数本身的边界穷举见 utils/floatingWindow.test.ts，此处验证组件三个触发点：
 * 拖动中 / show 重开 / window resize。
 */
describe('FloatingWindow 越界钳制（clamp 触发点）', () => {
  /** 覆盖视口尺寸（程序边界 = 视口） */
  function setViewport(vw: number, vh: number): void {
    Object.defineProperty(window, 'innerWidth', { value: vw, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: vh, configurable: true })
  }

  /** 覆盖窗口元素尺寸（prototype 级：v-if 重建的新元素同样返回 mock 值） */
  function mockElSize(w: number, h: number): void {
    Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
      get: () => w,
      configurable: true,
    })
    Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
      get: () => h,
      configurable: true,
    })
  }

  /** 等 show 触发的 nextTick(clamp) 跑完（flush 完成后测试续体先于 clamp 回调，补两拍保险） */
  async function flushClamp(): Promise<void> {
    await nextTick()
    await nextTick()
  }

  beforeEach(() => {
    setViewport(800, 600)
  })

  /** 挂载并把手拖到 (dx, dy)（pointerdown 于原点） */
  async function mountAndDrag(dx: number, dy: number) {
    const wrapper = mountWindow({ show: true })
    await flushClamp()
    const grip = wrapper.find('.plugin-float__grip')
    grip.element.setPointerCapture = vi.fn()
    await grip.trigger('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 })
    await grip.trigger('pointermove', { clientX: dx, clientY: dy, pointerId: 1 })
    return { wrapper, grip }
  }

  it('① 拖动中被约束：超远拖动被钳到贴边端点（窗口完整留在视口内）', async () => {
    mockElSize(300, 200)
    const { wrapper } = await mountAndDrag(5000, 5000)
    // 视口 800x600、窗口 300x200 → x ∈ [-250, 250]、y ∈ [-200, 200]
    const style = wrapper.find('.plugin-float').attributes('style') ?? ''
    expect(style).toContain('--float-x: 250px')
    expect(style).toContain('--float-y: 200px')
    wrapper.unmount()
  })

  it('② show 变 true 时越界检测：视口变小后重开，上次位置被拉回视口内', async () => {
    mockElSize(300, 200)
    const { wrapper } = await mountAndDrag(250, 200) // 拖到旧视口下的合法贴边位置
    await wrapper.setProps({ show: false }) // 关闭（offset 保留在组件本地状态）
    setViewport(400, 300) // 视口变小：x ∈ [-50, 50]、y ∈ [-50, 50]
    await wrapper.setProps({ show: true }) // 重开 → nextTick 实测尺寸后钳制
    await flushClamp()
    const style = wrapper.find('.plugin-float').attributes('style') ?? ''
    expect(style).toContain('--float-x: 50px')
    expect(style).toContain('--float-y: 50px')
    wrapper.unmount()
  })

  it('③ window resize：show=true 时视口变化 → 重新 clamp；show=false 不动作', async () => {
    mockElSize(300, 200)
    const { wrapper } = await mountAndDrag(250, 200)

    // show=true：视口缩小后派发 resize → 重新钳制
    setViewport(500, 400) // x ∈ [-100, 100]、y ∈ [-100, 100]
    window.dispatchEvent(new Event('resize'))
    await flushClamp()
    let style = wrapper.find('.plugin-float').attributes('style') ?? ''
    expect(style).toContain('--float-x: 100px')
    expect(style).toContain('--float-y: 100px')

    // show=false：resize 不产生任何钳制动作（窗口未渲染）
    await wrapper.setProps({ show: false })
    setViewport(200, 200)
    window.dispatchEvent(new Event('resize'))
    await flushClamp()
    expect(wrapper.find('.plugin-float').exists()).toBe(false)
    wrapper.unmount()
  })

  it('窗口尺寸 ≥ 视口：钳制退化为该轴居中（拖动也被钳回 0）', async () => {
    mockElSize(900, 700) // 大于视口 800x600
    const { wrapper } = await mountAndDrag(300, -300)
    const style = wrapper.find('.plugin-float').attributes('style') ?? ''
    expect(style).toContain('--float-x: 0px')
    expect(style).toContain('--float-y: 0px')
    wrapper.unmount()
  })
})
