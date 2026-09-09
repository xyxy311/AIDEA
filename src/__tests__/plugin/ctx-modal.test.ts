import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { createPluginRegister, createPluginModalApi } from '@/plugin/ui'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { useModalStore, SETTINGS_MODAL_KEY } from '@/stores/modal'
import PluginModalHost from '@/components/layout/PluginModalHost.vue'

/**
 * 插件模态运行时契约测试（ctx.modal = createPluginModalApi 工厂 + PluginModalHost 宿主）：
 * - open 收插件内短 id，先查登记表：未登记 → warn + false（fail fast，杜绝幽灵 key——
 *   modal store 不校验登记表，若放行会挂上 hasOpenModal=true 且无可见模态）；
 *   已登记 → 拼 `${pluginId}:${id}` 落 modalStore.activeKey；
 * - 单实例策略沿用 modal store：同 key 幂等 true；已有其他模态打开 → warn + false；
 * - close 幂等；
 * - 宿主渲染契约：只渲染登记在册条目（v-if），无任何清理逻辑——未登记 key / 条目被
 *   清理时 activeKey 保持原样（store 层状态归调用方管）。运行期注册表不变（启停仅
 *   持久化重启生效；removePlugin 运行期唯一触发为启动期 setup 回滚，此时无模态打开），
 *   故宿主无需孤儿兜底。
 */
const DummyComp = defineComponent(() => () => h('div'))

describe('ctx.modal（createPluginModalApi）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('open 短 id 拼前缀：经注册面登记后 open("about") → activeKey 为 "demo:about"', () => {
    // 与插件真实路径一致：经 createPluginRegister 登记
    expect(createPluginRegister('demo').registerModal({ id: 'about', title: '演示模态', component: DummyComp }))
      .toEqual({ ok: true })

    const ctxModal = createPluginModalApi('demo')
    const modalStore = useModalStore()
    expect(modalStore.activeKey).toBeNull()
    expect(ctxModal.open('about')).toBe(true)
    expect(modalStore.activeKey).toBe('demo:about')
  })

  it('open 未登记的短 id：入口校验拒绝 → false + warn，activeKey 保持 null', () => {
    const ctxModal = createPluginModalApi('demo')
    const modalStore = useModalStore()

    // 入口先查登记表：未登记直接拒绝，不落 store（幽灵 key 在入口被拦截）
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(ctxModal.open('missing')).toBe(false)
    expect(modalStore.activeKey).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('同 key 重复 open 幂等 true；已打开时 open 另一已登记短 id → false（单实例）', () => {
    const ui = createPluginRegister('demo')
    ui.registerModal({ id: 'm', title: '演示模态', component: DummyComp })
    ui.registerModal({ id: 'm2', title: '演示模态二', component: DummyComp }) // 已登记才能走单实例冲突路径
    const ctxModal = createPluginModalApi('demo')
    const modalStore = useModalStore()

    expect(ctxModal.open('m')).toBe(true)
    expect(ctxModal.open('m')).toBe(true) // 同 key 幂等

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(ctxModal.open('m2')).toBe(false) // 单实例冲突（m2 已登记，非入口校验拒绝）
    expect(modalStore.activeKey).toBe('demo:m')
    warn.mockRestore()
  })

  it('close 关闭当前模态；无模态打开时幂等', () => {
    createPluginRegister('demo').registerModal({ id: 'm', title: '演示模态', component: DummyComp })
    const ctxModal = createPluginModalApi('demo')
    const modalStore = useModalStore()

    expect(ctxModal.open('m')).toBe(true)
    ctxModal.close()
    expect(modalStore.activeKey).toBeNull()

    ctxModal.close() // 幂等：无模态打开时再 close 无副作用
    expect(modalStore.activeKey).toBeNull()
  })
})

describe('PluginModalHost 渲染契约', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('条目被 removePlugin 清理（运行期不会发生，防御性验证）：宿主不渲染且不干预 store 状态', async () => {
    createPluginRegister('demo').registerModal({ id: 'm', title: '演示模态', component: DummyComp })
    const ctxModal = createPluginModalApi('demo')
    const modalStore = useModalStore()
    expect(ctxModal.open('m')).toBe(true)

    const wrapper = mount(PluginModalHost)
    await wrapper.vm.$nextTick()
    // 条目在表 → 宿主渲染 ModalShell 外壳
    expect(wrapper.findComponent({ name: 'ModalShell' }).exists()).toBe(true)

    // 宿主无清理逻辑：登记条目消失 → 仅停止渲染，activeKey 保持（状态归调用方管）
    useUiRegistryStore().removePlugin('demo')
    await wrapper.vm.$nextTick()
    expect(modalStore.activeKey).toBe('demo:m')
    expect(wrapper.findComponent({ name: 'ModalShell' }).exists()).toBe(false)
    wrapper.unmount()
  })

  it('绕过入口直接 open 未登记 key（modal store 不校验登记表）：宿主不渲染、activeKey 保持', async () => {
    const modalStore = useModalStore()
    // 应用路径（如 SETTINGS_MODAL_KEY）有意不经登记表校验：store 层状态归调用方管
    expect(modalStore.open('ghost:missing')).toBe(true)

    const wrapper = mount(PluginModalHost)
    await wrapper.vm.$nextTick()
    // 宿主只渲染登记在册条目：未登记 → 不渲染，且不主动 close
    expect(modalStore.activeKey).toBe('ghost:missing')
    expect(wrapper.findComponent({ name: 'ModalShell' }).exists()).toBe(false)
    wrapper.unmount()
  })

  it('内置保留 key（settings）不经宿主渲染、宿主不干预', async () => {
    const modalStore = useModalStore()
    // 设置面板走保留 key：登记表中无条目，宿主不渲染也不干预 store 状态
    expect(modalStore.open(SETTINGS_MODAL_KEY)).toBe(true)

    const wrapper = mount(PluginModalHost)
    await wrapper.vm.$nextTick()
    // 宿主对内置模态不渲染（v-if），activeKey 保持打开状态
    expect(wrapper.findComponent({ name: 'ModalShell' }).exists()).toBe(false)
    expect(modalStore.activeKey).toBe(SETTINGS_MODAL_KEY)
    wrapper.unmount()
  })

  it('正常路径：activeKey 指向在表条目 → 渲染且不误关；close 后卸载', async () => {
    createPluginRegister('demo').registerModal({ id: 'm', title: '演示模态', component: DummyComp })
    const ctxModal = createPluginModalApi('demo')
    const modalStore = useModalStore()

    const wrapper = mount(PluginModalHost)
    expect(ctxModal.open('m')).toBe(true)
    await wrapper.vm.$nextTick()

    expect(modalStore.activeKey).toBe('demo:m')
    expect(wrapper.findComponent({ name: 'ModalShell' }).exists()).toBe(true)

    modalStore.close()
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'ModalShell' }).exists()).toBe(false)
    wrapper.unmount()
  })
})
