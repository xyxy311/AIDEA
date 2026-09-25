/**
 * ShortcutActionRow — 快捷键动作改键行的真实挂载测试：
 * 验证渲染、录制态、恢复默认、冲突提示及多实例隔离。
 * 说明：插件动作须先登记进 uiRegistry（store.assign 依赖登记表）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ShortcutActionRow from '@/components/common/ShortcutActionRow.vue'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { formatChord } from '@/utils/shortcuts'
import { t } from '@/composables/useT'
import type { PluginShortcutActionRegistration } from '@/plugin/ui'

/** 构造插件快捷键动作登记（defaultChord mod+shift+g 未占用保留键与内置绑定） */
function dummyAction(over: Partial<PluginShortcutActionRegistration> = {}): PluginShortcutActionRegistration {
  return {
    id: 'act',
    label: '演示动作',
    scope: 'canvas',
    defaultChord: 'mod+shift+g',
    run: () => undefined,
    ...over,
  }
}

/** 向 window 派发 keydown（组件经 window 捕获阶段监听） */
function pressKey(init: {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

/** 已挂载实例收集：afterEach 统一 unmount——否则 window 捕获监听器跨用例累积，
 *  仍处录制态的旧实例会先消费按键（stopImmediatePropagation）拦截当前用例实例 */
const wrappers: VueWrapper<any, any>[] = []

/** 登记挂载实例 */
function track(wrapper: VueWrapper<any, any>): VueWrapper<any, any> {
  wrappers.push(wrapper)
  return wrapper
}

/** 登记插件动作 demo:act 并挂载对应改键行 */
function mountDemoRow() {
  useUiRegistryStore().registerPluginShortcutAction('demo', dummyAction())
  const wrapper = track(mount(ShortcutActionRow, { props: { actionKey: 'demo:act', label: '演示动作' } }))
  return { wrapper, shortcuts: useShortcutsStore() }
}

describe('ShortcutActionRow（改键行）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    for (const w of wrappers.splice(0)) w.unmount()
  })

  it('渲染 label 与当前绑定键（无覆盖时 kbd 显示 defaultChord 的展示格式）', () => {
    const { wrapper, shortcuts } = mountDemoRow()
    expect(wrapper.text()).toContain('演示动作')
    expect(shortcuts.getBinding('demo:act')).toBe('mod+shift+g')
    expect(wrapper.find('.shortcut-kbd').text()).toBe(formatChord('mod+shift+g'))
    // 非录制态无错误提示
    expect(wrapper.find('.setting-error').exists()).toBe(false)
  })

  it('点击键帽进入录制态；录制按键写入 store 并退出录制', async () => {
    const { wrapper, shortcuts } = mountDemoRow()

    await wrapper.find('.shortcut-kbd').trigger('click')
    expect(wrapper.classes()).toContain('is-recording')
    expect(wrapper.find('.shortcut-kbd').text()).toBe(t('shortcuts.recording'))

    pressKey({ key: 'j' })
    await wrapper.vm.$nextTick()
    // assign 写入覆盖，kbd 回显示新绑定
    expect(shortcuts.getBinding('demo:act')).toBe('j')
    expect(wrapper.classes()).not.toContain('is-recording')
    expect(wrapper.find('.shortcut-kbd').text()).toBe(formatChord('j'))
  })

  it('录制中按纯修饰键继续等待：不退出录制、不改绑定、无错误', async () => {
    const { wrapper, shortcuts } = mountDemoRow()
    await wrapper.find('.shortcut-kbd').trigger('click')

    pressKey({ key: 'Shift', shiftKey: true })
    await wrapper.vm.$nextTick()

    expect(wrapper.classes()).toContain('is-recording')
    expect(shortcuts.getBinding('demo:act')).toBe('mod+shift+g')
    expect(wrapper.find('.setting-error').exists()).toBe(false)
  })

  it('录制中按 Esc 取消：退出录制、绑定不变', async () => {
    const { wrapper, shortcuts } = mountDemoRow()
    await wrapper.find('.shortcut-kbd').trigger('click')

    pressKey({ key: 'Escape' })
    await wrapper.vm.$nextTick()

    expect(wrapper.classes()).not.toContain('is-recording')
    expect(shortcuts.getBinding('demo:act')).toBe('mod+shift+g')
    expect(wrapper.find('.shortcut-kbd').text()).toBe(formatChord('mod+shift+g'))
  })

  it('恢复默认按钮：清除用户覆盖回 defaultChord（store.reset 生效）', async () => {
    const { wrapper, shortcuts } = mountDemoRow()
    // 先经录制改键
    await wrapper.find('.shortcut-kbd').trigger('click')
    pressKey({ key: 'j' })
    await wrapper.vm.$nextTick()
    expect(shortcuts.getBinding('demo:act')).toBe('j')

    await wrapper.find('.reset-btn').trigger('click')
    expect(shortcuts.overrides['demo:act']).toBeUndefined()
    expect(shortcuts.getBinding('demo:act')).toBe('mod+shift+g')
    expect(wrapper.find('.shortcut-kbd').text()).toBe(formatChord('mod+shift+g'))
  })

  it('冲突提示：录制成内置动作已占用的键 → 显示冲突文案且不改绑定', async () => {
    const { wrapper, shortcuts } = mountDemoRow()
    await wrapper.find('.shortcut-kbd').trigger('click')

    // mod+s 已被内置 save（保存项目）占用
    pressKey({ key: 's', ctrlKey: true })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.setting-error').text())
      .toBe(t('shortcuts.conflict', { name: t('shortcuts.actionSave') }))
    expect(shortcuts.getBinding('demo:act')).toBe('mod+shift+g')
    // 冲突后同样退出录制
    expect(wrapper.classes()).not.toContain('is-recording')
  })

  it('多实例共存：未录制实例不消费按键（recording=false 直接 return）', async () => {
    const registry = useUiRegistryStore()
    registry.registerPluginShortcutAction('demo', dummyAction({ id: 'a', label: '动作A', defaultChord: 'mod+shift+g' }))
    registry.registerPluginShortcutAction('demo', dummyAction({ id: 'b', label: '动作B', defaultChord: undefined }))
    const shortcuts = useShortcutsStore()

    const wrapperA = track(mount(ShortcutActionRow, { props: { actionKey: 'demo:a', label: '动作A' } }))
    const wrapperB = track(mount(ShortcutActionRow, { props: { actionKey: 'demo:b', label: '动作B' } }))

    // 仅 A 进入录制态；B 保持未录制（其监听直接 return）
    await wrapperA.find('.shortcut-kbd').trigger('click')
    pressKey({ key: 'j' })
    await Promise.all([wrapperA.vm.$nextTick(), wrapperB.vm.$nextTick()])

    expect(shortcuts.getBinding('demo:a')).toBe('j')
    expect(shortcuts.getBinding('demo:b')).toBe('') // B 未受影响（无绑定）
    expect(wrapperA.classes()).not.toContain('is-recording')
    expect(wrapperB.classes()).not.toContain('is-recording')
  })
})
