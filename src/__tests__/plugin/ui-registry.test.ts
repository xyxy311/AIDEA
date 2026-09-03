import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import {
  createPluginUiApi,
  rollbackPluginUi,
  wrapTopBarButton,
  type PluginPanelRegistration,
  type PluginTopBarButtonRegistration,
} from '@/plugin/ui'
import { useUiRegistryStore } from '@/stores/uiRegistry'

/**
 * 插件 UI 注册契约测试（ui-registry）：
 * 针对 createPluginUiApi + uiRegistry 登记总表（stores/uiRegistry.ts）的实际行为。
 *
 * 关键事实（以实代码为准，勿臆测）：
 * - createPluginUiApi 的方法**返回 void**；冲突 / 非法 id 由 uiRegistry 内建校验
 *   （registerPlugin* 返回 false + console.warn），api 层据此 warn 并跳过，不抛错。
 * - 注册去向为 uiRegistry：key = `${pluginId}:${id}`，origin='plugin'，含 pluginId 归因；
 *   defaultPlacement 缺省 'right'、顶栏 defaultZone 缺省 'left' 在 registry 写入时兜底。
 * - 顶栏按钮：api 层先 wrapTopBarButton 包装为逻辑组件，再连同 { id, title, defaultZone } 传入 registry。
 * - 回滚：rollbackPluginUi → registry.removePlugin(pluginId)，三表 demo:* 全部清除。
 * - 排布（layout）由 uiRegistry 派生，注册后自动生效，本测试不涉及 layout，只验 uiRegistry 契约。
 */
const Icon = defineComponent(() => () => h('div'))

function dummyPanel(over: Partial<PluginPanelRegistration> = {}): PluginPanelRegistration {
  return {
    id: 'p',
    title: '统计助手',
    icon: Icon,
    component: defineComponent(() => () => h('div')),
    ...over,
  }
}

function dummyButton(over: Partial<PluginTopBarButtonRegistration> = {}): PluginTopBarButtonRegistration {
  return {
    id: 'btn',
    title: '示例动作',
    icon: Icon,
    onClick: () => undefined,
    ...over,
  }
}

describe('插件 UI 注册契约（uiRegistry）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('registerPanel：登记进 uiRegistry，key=demo:p，origin=plugin，pluginId=demo', () => {
    const ui = createPluginUiApi('demo')
    ui.registerPanel(dummyPanel())

    const registry = useUiRegistryStore()
    const entry = registry.panels.get('demo:p')
    expect(entry).toBeDefined()
    expect(entry!.key).toBe('demo:p')
    expect(entry!.origin).toBe('plugin')
    expect(entry!.pluginId).toBe('demo')
    expect(entry!.title).toBe('统计助手')
    // reactive Map 深响应式会代理组件对象；断言存在性而非同一引用
    expect(entry!.icon).toBeTruthy()
    expect(entry!.component).toBeTruthy()
  })

  it('registerPanel：defaultPlacement 缺省 → registry 兜底为 right', () => {
    const ui = createPluginUiApi('demo')
    ui.registerPanel(dummyPanel({})) // 不传 defaultPlacement

    const entry = useUiRegistryStore().panels.get('demo:p')
    expect(entry).toBeDefined()
    expect(entry!.defaultPlacement).toBe('right')

    // 显式传入 left → 按传入值存储
    const ui2 = createPluginUiApi('demo2')
    ui2.registerPanel(dummyPanel({ id: 'p2', defaultPlacement: 'left' }))
    expect(useUiRegistryStore().panels.get('demo2:p2')!.defaultPlacement).toBe('left')
  })

  it('registerTopBarButton：登记进 uiRegistry，component 为 wrapTopBarButton 产物，defaultZone 缺省 left', () => {
    const ui = createPluginUiApi('demo')
    ui.registerTopBarButton(dummyButton({})) // zone 省略

    const registry = useUiRegistryStore()
    const entry = registry.topBarButtons.get('demo:btn')
    expect(entry).toBeDefined()
    expect(entry!.origin).toBe('plugin')
    expect(entry!.pluginId).toBe('demo')
    expect(entry!.title).toBe('示例动作')
    // component 必须是逻辑组件对象（wrapTopBarButton 的 defineComponent 产物）
    expect(typeof entry!.component).toBe('object')
    expect(entry!.defaultZone).toBe('left')

    // zone 显式 right → 按传入值存储
    const ui2 = createPluginUiApi('demo2')
    ui2.registerTopBarButton(dummyButton({ id: 'btn2', zone: 'right' }))
    expect(useUiRegistryStore().topBarButtons.get('demo2:btn2')!.defaultZone).toBe('right')
  })

  it('registerSettingsCategory：登记进 uiRegistry 设置栏目表', () => {
    const ui = createPluginUiApi('demo')
    ui.registerSettingsCategory({ id: 'cfg', title: '配置', component: Icon })

    const entry = useUiRegistryStore().settingsCategories.get('demo:cfg')
    expect(entry).toBeDefined()
    expect(entry!.origin).toBe('plugin')
    expect(entry!.pluginId).toBe('demo')
    expect(entry!.title).toBe('配置')
    expect(entry!.component).toBeTruthy()
  })

  it('短 id 非法（含 : / 空白 / 空）→ console.warn 且不入表', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ui = createPluginUiApi('demo')
    ui.registerPanel(dummyPanel({ id: 'a:b' }))
    ui.registerPanel(dummyPanel({ id: 'a b' }))
    ui.registerPanel(dummyPanel({ id: '' }))
    ui.registerTopBarButton(dummyButton({ id: 'x:y' }))
    ui.registerTopBarButton(dummyButton({ id: '' }))
    ui.registerSettingsCategory({ id: 'x y', title: '配置', component: Icon })

    const registry = useUiRegistryStore()
    expect(registry.panels.has('demo:a:b')).toBe(false)
    expect(registry.panels.has('demo:a b')).toBe(false)
    expect(registry.panels.has('demo:')).toBe(false)
    expect(registry.topBarButtons.has('demo:x:y')).toBe(false)
    expect(registry.topBarButtons.has('demo:')).toBe(false)
    expect(registry.settingsCategories.has('demo:x y')).toBe(false)
    // api 层至少对每类非法 id 各 warn 一次
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(6)
    warn.mockRestore()
  })

  it('冲突：同 key 二次注册（返回 void）→ warn + 表内容不被覆盖', () => {
    const ui = createPluginUiApi('demo')
    ui.registerPanel(dummyPanel({ title: '原始标题' }))

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // api 层返回 void，冲突由 registry 拒绝（warn），不覆盖
    const ret = ui.registerPanel(dummyPanel({ title: '新标题' }))
    expect(ret).toBeUndefined()

    const entry = useUiRegistryStore().panels.get('demo:p')
    expect(entry!.title).toBe('原始标题') // 未被覆盖
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('rollbackPluginUi：三表 demo:* 全部清除，不影响其它插件', () => {
    const ui = createPluginUiApi('demo')
    ui.registerPanel(dummyPanel())
    ui.registerTopBarButton(dummyButton())
    ui.registerSettingsCategory({ id: 'cfg', title: '配置', component: Icon })

    // 另一个插件共享同一张表，回滚 demo 不应误伤
    const ui2 = createPluginUiApi('other')
    ui2.registerPanel({ ...dummyPanel({ id: 'p2', title: '其他面板' }) })

    const registry = useUiRegistryStore()
    expect(registry.panels.has('demo:p')).toBe(true)
    expect(registry.topBarButtons.has('demo:btn')).toBe(true)
    expect(registry.settingsCategories.has('demo:cfg')).toBe(true)

    rollbackPluginUi('demo')
    expect(registry.panels.has('demo:p')).toBe(false)
    expect(registry.topBarButtons.has('demo:btn')).toBe(false)
    expect(registry.settingsCategories.has('demo:cfg')).toBe(false)
    expect(registry.panels.has('other:p2')).toBe(true) // 其它插件保留
  })
})

describe('wrapTopBarButton（可选挂载冒烟）', () => {
  it('onClick 抛错被隔离：console.error 记录，不向外抛', async () => {
    setActivePinia(createPinia())
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const Component = wrapTopBarButton({
      id: 'boom',
      title: '会抛错的按钮',
      icon: Icon,
      onClick: () => {
        throw new Error('boom-click')
      },
    })
    expect(typeof Component).toBe('object')

    const wrapper = mount(Component)
    await wrapper.vm.$nextTick()

    // 按钮本体点击 → onClick 抛错被 try/catch 隔离，测试不向外抛
    const btn = wrapper.find('button.top-btn')
    expect(btn.exists()).toBe(true)
    // 若无主按钮（渲染受限）则跳过点击；异常路径已由 spy 兜底
    if (btn.exists()) {
      btn.trigger('click')
    }
    await wrapper.vm.$nextTick()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})