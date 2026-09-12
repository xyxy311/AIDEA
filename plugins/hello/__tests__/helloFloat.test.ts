import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { usePluginStore } from '@/stores/plugin'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { usePluginFloatingStore } from '@/stores/pluginFloating'
import { adapter } from '@/plugin/adapter'
import HelloFloatPanel from '../components/HelloFloatPanel.vue'
import { t } from '@/composables/useT'

/**
 * hello 插件浮动层（FloatingWindow + SDK 浮动层 API 的测试载体）：
 * - 装载契约：真实装载（启用意愿写入 localStorage 后 init）→ setup 登记浮动层
 *   `hello:float` 与 toggle 快捷键动作 `hello:float`（默认 h）；
 * - 运行链路：floating.toggle 打开 → HelloFloatPanel 的「关闭」按钮（关闭由插件负责）
 *   经 adapter.for('hello').floating.close 关闭——真实登记表 / pluginFloating store 链路。
 */
describe('hello 浮动层（演示载体）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    // 启用意愿：只启用 hello（setup 才会执行；默认无记录 = 不启用）
    localStorage.setItem('aidea-plugins', JSON.stringify({ hello: true }))
  })

  it('插件装载后登记 hello:float 浮动层与 float 快捷键（默认 h，scope canvas）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await usePluginStore().init()

    const registry = useUiRegistryStore()
    // 浮动层登记：title 经 t() 解析，component 为纯内容组件
    const layer = registry.floatingLayers.get('hello:float')
    expect(layer).toBeDefined()
    expect(layer!.pluginId).toBe('hello')
    expect(layer!.title).toBe(t('hello.floatTitle'))
    expect(layer!.component).toBeTruthy()

    // toggle 快捷键动作：默认 h（未与内置 a/q/r/d、AI i/c、保留键冲突）→ 注册成功无 warn
    const action = registry.shortcutActions.get('hello:float')
    expect(action).toBeDefined()
    expect(action!.def.id).toBe('float')
    expect(action!.def.scope).toBe('canvas')
    expect(action!.def.defaultChord).toBe('h')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('toggle 打开后，面板「关闭」按钮经 floating.close 关闭（关闭由插件负责）', async () => {
    await usePluginStore().init()
    const floating = adapter.for('hello').floating
    expect(floating.isVisible('float')).toBe(false)

    // 开（对齐快捷键 run 的 toggle 路径）
    expect(floating.toggle('float')).toBe(true)
    expect(floating.isVisible('float')).toBe(true)
    expect(usePluginFloatingStore().isVisible('hello:float')).toBe(true)

    // 面板内「关闭」按钮 → floating.close('float') → store 显隐翻转
    const wrapper = mount(HelloFloatPanel)
    const closeBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === t('hello.floatClose'))
    expect(closeBtn).toBeDefined()
    await closeBtn!.trigger('click')
    expect(floating.isVisible('float')).toBe(false)
    wrapper.unmount()
  })
})
