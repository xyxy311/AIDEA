import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { createPluginRegister, createPluginFloatingApi } from '@/plugin/ui'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { usePluginFloatingStore } from '@/stores/pluginFloating'
import PluginFloatingHost from '@/components/layout/PluginFloatingHost.vue'

/**
 * 插件浮动层运行时契约测试（ctx.floating = createPluginFloatingApi 工厂 + PluginFloatingHost 宿主）：
 * - open/toggle 收插件内短 id，先查登记表：未登记 → warn + false（fail fast，对齐
 *   createPluginModalApi 的措辞——pluginFloating store 本身不校验登记表，入口拦截杜绝
 *   「未登记 key 直接挂显隐状态」的失配）；
 * - 已登记 → 拼 `${pluginId}:${id}` 转发 pluginFloating store（多实例，逐 key 显隐互不影响）；
 * - close / isVisible 幂等只读，不做登记表校验（无害失败语义天然成立）；
 * - 宿主渲染契约：逐条目渲染通用窗口壳 common/FloatingWindow（stub teleport/transition
 *   简化断言），窗口 v-if（show prop，由宿主映射 pluginFloating store）——默认隐藏，
 *   open 才可见；条目被 removePlugin 清理 → 窗口卸载且不清理 store 状态（状态归调用方
 *   管，对齐 PluginModalHost 渲染契约）。
 */
const DummyComp = defineComponent(() => () => h('div'))

describe('ctx.floating（createPluginFloatingApi）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('open 短 id 拼前缀：经注册面登记后 open("words") → 完整 key 可见', () => {
    // 与插件真实路径一致：经 createPluginRegister 登记（返回 void，对齐 registerPanel）
    createPluginRegister('demo').registerFloatingLayer({ id: 'words', component: DummyComp })

    const ctxFloating = createPluginFloatingApi('demo')
    const store = usePluginFloatingStore()
    expect(store.isVisible('demo:words')).toBe(false)
    expect(ctxFloating.open('words')).toBe(true)
    expect(store.isVisible('demo:words')).toBe(true)
  })

  it('open 未登记的短 id：入口校验拒绝 → false + warn，store 无条目', () => {
    const ctxFloating = createPluginFloatingApi('demo')
    const store = usePluginFloatingStore()

    // 入口先查登记表：未登记直接拒绝，不落 store（幽灵 key 在入口被拦截）
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(ctxFloating.open('missing')).toBe(false)
    expect(store.states.has('demo:missing')).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('open 幂等 true；close 幂等；isVisible 只读查询（未登记 → false 无副作用）', () => {
    createPluginRegister('demo').registerFloatingLayer({ id: 'w', component: DummyComp })
    const ctxFloating = createPluginFloatingApi('demo')

    expect(ctxFloating.open('w')).toBe(true)
    expect(ctxFloating.open('w')).toBe(true) // 幂等
    ctxFloating.close('w')
    expect(ctxFloating.isVisible('w')).toBe(false)

    ctxFloating.close('w') // 幂等：再 close 无副作用
    expect(ctxFloating.isVisible('ghost')).toBe(false) // 未登记：纯查询 false
    expect(usePluginFloatingStore().states.has('demo:ghost')).toBe(false)
  })

  it('toggle：已登记 → 返回切换后可见性；未登记 → warn + false', () => {
    createPluginRegister('demo').registerFloatingLayer({ id: 'w', component: DummyComp })
    const ctxFloating = createPluginFloatingApi('demo')

    expect(ctxFloating.toggle('w')).toBe(true)
    expect(ctxFloating.toggle('w')).toBe(false)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(ctxFloating.toggle('missing')).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('多实例：两个已登记浮动层显隐互不影响', () => {
    const ui = createPluginRegister('demo')
    ui.registerFloatingLayer({ id: 'a', component: DummyComp })
    ui.registerFloatingLayer({ id: 'b', component: DummyComp })
    const ctxFloating = createPluginFloatingApi('demo')

    ctxFloating.open('a')
    ctxFloating.open('b')
    ctxFloating.close('a')
    expect(ctxFloating.isVisible('a')).toBe(false)
    expect(ctxFloating.isVisible('b')).toBe(true)
  })
})

describe('PluginFloatingHost 渲染契约', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /** 挂载宿主（stub teleport/transition：内容留在组件树内、出入场无动画，便于同步断言） */
  function mountHost() {
    return mount(PluginFloatingHost, {
      global: { stubs: { teleport: true, transition: true } },
    })
  }

  it('默认隐藏：条目在表但未 open → 不渲染窗口；open → 渲染（含把手条标题）；close → 卸载', async () => {
    createPluginRegister('demo').registerFloatingLayer({
      id: 'w',
      title: '演示浮窗',
      component: DummyComp,
    })
    const ctxFloating = createPluginFloatingApi('demo')

    const wrapper = mountHost()
    await wrapper.vm.$nextTick()
    // 默认隐藏：登记 ≠ 可见（open 才可见）
    expect(wrapper.find('.plugin-float').exists()).toBe(false)

    expect(ctxFloating.open('w')).toBe(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.plugin-float').exists()).toBe(true)
    // 把手条标题来自登记条目 title（宿主窗口 chrome；无关闭按钮——关闭由插件内容负责）
    expect(wrapper.find('.plugin-float__title').text()).toBe('演示浮窗')
    expect(wrapper.find('.plugin-float__grip').exists()).toBe(true)

    ctxFloating.close('w')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.plugin-float').exists()).toBe(false)
    wrapper.unmount()
  })

  it('title 缺省：窗口渲染但把手条不渲染标题文本', async () => {
    createPluginRegister('demo').registerFloatingLayer({ id: 'bare', component: DummyComp })
    createPluginFloatingApi('demo').open('bare')

    const wrapper = mountHost()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.plugin-float').exists()).toBe(true)
    expect(wrapper.find('.plugin-float__title').exists()).toBe(false)
    wrapper.unmount()
  })

  it('条目被 removePlugin 清理：窗口卸载，store 状态保持（状态归调用方管）', async () => {
    createPluginRegister('demo').registerFloatingLayer({ id: 'w', component: DummyComp })
    const ctxFloating = createPluginFloatingApi('demo')
    const store = usePluginFloatingStore()
    expect(ctxFloating.open('w')).toBe(true)

    const wrapper = mountHost()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.plugin-float').exists()).toBe(true)

    // 宿主无清理逻辑：登记条目消失 → 仅停止渲染，store 状态保持原样
    useUiRegistryStore().removePlugin('demo')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.plugin-float').exists()).toBe(false)
    expect(store.isVisible('demo:w')).toBe(true)
    wrapper.unmount()
  })
})
