import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import {
  createPluginRegister,
  rollbackPluginUi,
  wrapTopBarButton,
  type PluginPanelRegistration,
  type PluginTopBarButtonRegistration,
  type PluginShortcutActionRegistration,
  type PluginContextMenuItemRegistration,
} from '@/plugin/ui'
import type { ModalRegistration } from '@/types/modal'
import { useUiRegistryStore } from '@/stores/uiRegistry'

/**
 * 插件注册面契约测试（ui-registry）：
 * 针对 createPluginRegister + uiRegistry 登记总表（stores/uiRegistry.ts）的实际行为。
 *
 * 关键事实（以实代码为准，勿臆测）：
 * - createPluginRegister 的方法**返回 void**（右键菜单项 / 快捷键动作除外，返回 {ok, conflict?}）；
 *   冲突 / 非法 id 由 uiRegistry 内建校验（registerPlugin* 返回 false + console.warn），
 *   api 层据此 warn 并跳过，不抛错。
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

function dummyShortcutAction(over: Partial<PluginShortcutActionRegistration> = {}): PluginShortcutActionRegistration {
  return {
    id: 'act',
    label: '演示动作',
    scope: 'canvas',
    defaultChord: 'mod+shift+g',
    run: () => undefined,
    ...over,
  }
}

function dummyMenuItem(over: Partial<PluginContextMenuItemRegistration> = {}): PluginContextMenuItemRegistration {
  return {
    id: 'item',
    scope: 'selection',
    label: '演示菜单',
    run: () => undefined,
    ...over,
  }
}

function dummyModal(over: Partial<ModalRegistration> = {}): ModalRegistration {
  return {
    id: 'modal',
    title: '演示模态',
    component: defineComponent(() => () => h('div')),
    ...over,
  }
}

describe('插件 UI 注册契约（uiRegistry）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('registerPanel：登记进 uiRegistry，key=demo:p，origin=plugin，pluginId=demo', () => {
    const ui = createPluginRegister('demo')
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
    const ui = createPluginRegister('demo')
    ui.registerPanel(dummyPanel({})) // 不传 defaultPlacement

    const entry = useUiRegistryStore().panels.get('demo:p')
    expect(entry).toBeDefined()
    expect(entry!.defaultPlacement).toBe('right')

    // 显式传入 left → 按传入值存储
    const ui2 = createPluginRegister('demo2')
    ui2.registerPanel(dummyPanel({ id: 'p2', defaultPlacement: 'left' }))
    expect(useUiRegistryStore().panels.get('demo2:p2')!.defaultPlacement).toBe('left')
  })

  it('registerTopBarButton：登记进 uiRegistry，component 为 wrapTopBarButton 产物，defaultZone 缺省 left', () => {
    const ui = createPluginRegister('demo')
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
    const ui2 = createPluginRegister('demo2')
    ui2.registerTopBarButton(dummyButton({ id: 'btn2', zone: 'right' }))
    expect(useUiRegistryStore().topBarButtons.get('demo2:btn2')!.defaultZone).toBe('right')
  })

  it('registerSettingsCategory：登记进 uiRegistry 设置栏目表', () => {
    const ui = createPluginRegister('demo')
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
    const ui = createPluginRegister('demo')
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
    const ui = createPluginRegister('demo')
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
    const ui = createPluginRegister('demo')
    ui.registerPanel(dummyPanel())
    ui.registerTopBarButton(dummyButton())
    ui.registerSettingsCategory({ id: 'cfg', title: '配置', component: Icon })

    // 另一个插件共享同一张表，回滚 demo 不应误伤
    const ui2 = createPluginRegister('other')
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

describe('uiRegistry 两新表：快捷键动作 / 右键菜单项登记', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('registerPluginShortcutAction：成功返回 {ok:true}，key 归一 demo:act，条目含 pluginId 与 def', () => {
    const registry = useUiRegistryStore()
    const res = registry.registerPluginShortcutAction('demo', dummyShortcutAction())
    expect(res).toEqual({ ok: true })

    const entry = registry.shortcutActions.get('demo:act')
    expect(entry).toBeDefined()
    expect(entry!.key).toBe('demo:act')
    expect(entry!.origin).toBe('plugin')
    expect(entry!.pluginId).toBe('demo')
    expect(entry!.def.label).toBe('演示动作')
    expect(entry!.def.scope).toBe('canvas')
    expect(entry!.def.defaultChord).toBe('mod+shift+g')
    expect(typeof entry!.def.run).toBe('function')
  })

  it('registerPluginContextMenuItem：成功返回 {ok:true}，key 归一 demo:item', () => {
    const registry = useUiRegistryStore()
    const res = registry.registerPluginContextMenuItem('demo', dummyMenuItem())
    expect(res).toEqual({ ok: true })

    const entry = registry.contextMenuItems.get('demo:item')
    expect(entry).toBeDefined()
    expect(entry!.key).toBe('demo:item')
    expect(entry!.origin).toBe('plugin')
    expect(entry!.pluginId).toBe('demo')
    expect(entry!.def.scope).toBe('selection')
    expect(entry!.def.label).toBe('演示菜单')
  })

  it('短 id 非法（空 / 含 : / 含空白）→ warn + { ok:false, conflict:"id" }，不入表', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = useUiRegistryStore()

    expect(registry.registerPluginShortcutAction('demo', dummyShortcutAction({ id: '' })))
      .toEqual({ ok: false, conflict: 'id' })
    expect(registry.registerPluginShortcutAction('demo', dummyShortcutAction({ id: 'a:b' })))
      .toEqual({ ok: false, conflict: 'id' })
    expect(registry.registerPluginShortcutAction('demo', dummyShortcutAction({ id: 'a b' })))
      .toEqual({ ok: false, conflict: 'id' })
    expect(registry.registerPluginContextMenuItem('demo', dummyMenuItem({ id: '' })))
      .toEqual({ ok: false, conflict: 'id' })
    expect(registry.registerPluginContextMenuItem('demo', dummyMenuItem({ id: 'x:y' })))
      .toEqual({ ok: false, conflict: 'id' })
    expect(registry.registerPluginContextMenuItem('demo', dummyMenuItem({ id: 'x y' })))
      .toEqual({ ok: false, conflict: 'id' })

    expect(registry.shortcutActions.size).toBe(0)
    expect(registry.contextMenuItems.size).toBe(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('key 冲突：同 key 二次注册 → warn + { ok:false, conflict:"id" }，def 不被覆盖', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = useUiRegistryStore()
    registry.registerPluginShortcutAction('demo', dummyShortcutAction({ label: '原始动作' }))
    registry.registerPluginContextMenuItem('demo', dummyMenuItem({ label: '原始菜单' }))

    expect(registry.registerPluginShortcutAction('demo', dummyShortcutAction({ label: '新动作' })))
      .toEqual({ ok: false, conflict: 'id' })
    expect(registry.registerPluginContextMenuItem('demo', dummyMenuItem({ label: '新菜单' })))
      .toEqual({ ok: false, conflict: 'id' })

    expect(registry.shortcutActions.get('demo:act')!.def.label).toBe('原始动作')
    expect(registry.contextMenuItems.get('demo:item')!.def.label).toBe('原始菜单')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('removePlugin 回滚两表清空，不影响其它插件；reset 一并清空', () => {
    const registry = useUiRegistryStore()
    registry.registerPluginShortcutAction('demo', dummyShortcutAction())
    registry.registerPluginContextMenuItem('demo', dummyMenuItem())
    // 其它插件共享同一张表
    registry.registerPluginShortcutAction('other', dummyShortcutAction({ id: 'act2' }))
    registry.registerPluginContextMenuItem('other', dummyMenuItem({ id: 'item2' }))

    registry.removePlugin('demo')
    expect(registry.shortcutActions.has('demo:act')).toBe(false)
    expect(registry.contextMenuItems.has('demo:item')).toBe(false)
    expect(registry.shortcutActions.has('other:act2')).toBe(true) // 其它插件保留
    expect(registry.contextMenuItems.has('other:item2')).toBe(true)

    registry.reset()
    expect(registry.shortcutActions.size).toBe(0)
    expect(registry.contextMenuItems.size).toBe(0)
  })

  it('经 PluginRegisterApi.registerContextMenuItem 注册：透传 ok/conflict，非法短 id 返回 conflict:"id"', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ui = createPluginRegister('demo')
    expect(ui.registerContextMenuItem(dummyMenuItem())).toEqual({ ok: true })
    expect(useUiRegistryStore().contextMenuItems.has('demo:item')).toBe(true)

    expect(ui.registerContextMenuItem(dummyMenuItem({ id: 'bad:id' })))
      .toEqual({ ok: false, conflict: 'id' })
    expect(ui.registerContextMenuItem(dummyMenuItem({ id: 'dup' }))).toEqual({ ok: true })
    expect(ui.registerContextMenuItem(dummyMenuItem({ id: 'dup' })))
      .toEqual({ ok: false, conflict: 'id' })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('uiRegistry 模态面板表：登记 / 冲突 / 清理', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('registerPluginModal：成功返回 {ok:true}，key 归一 demo:modal，条目含 pluginId 与 def', () => {
    const registry = useUiRegistryStore()
    const res = registry.registerPluginModal('demo', dummyModal({ width: 480 }))
    expect(res).toEqual({ ok: true })

    const entry = registry.modals.get('demo:modal')
    expect(entry).toBeDefined()
    expect(entry!.key).toBe('demo:modal')
    expect(entry!.origin).toBe('plugin')
    expect(entry!.pluginId).toBe('demo')
    expect(entry!.def.title).toBe('演示模态')
    expect(entry!.def.width).toBe(480)
    // reactive Map 深响应式会代理组件对象；断言存在性而非同一引用
    expect(entry!.def.component).toBeTruthy()
  })

  it('registerPluginModal：width 缺省 → def 原样保留（无 width 字段）', () => {
    const registry = useUiRegistryStore()
    registry.registerPluginModal('demo', dummyModal())
    expect(registry.modals.get('demo:modal')!.def.width).toBeUndefined()
  })

  it('短 id 非法（空 / 含 : / 含空白）→ warn + { ok:false, conflict:"id" }，不入表', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = useUiRegistryStore()

    expect(registry.registerPluginModal('demo', dummyModal({ id: '' })))
      .toEqual({ ok: false, conflict: 'id' })
    expect(registry.registerPluginModal('demo', dummyModal({ id: 'a:b' })))
      .toEqual({ ok: false, conflict: 'id' })
    expect(registry.registerPluginModal('demo', dummyModal({ id: 'a b' })))
      .toEqual({ ok: false, conflict: 'id' })

    expect(registry.modals.size).toBe(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('key 冲突：同插件内同短 id 二次注册 → warn + { ok:false, conflict:"id" }，def 不被覆盖', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = useUiRegistryStore()
    registry.registerPluginModal('demo', dummyModal({ title: '原始模态' }))

    expect(registry.registerPluginModal('demo', dummyModal({ title: '新模态' })))
      .toEqual({ ok: false, conflict: 'id' })

    expect(registry.modals.get('demo:modal')!.def.title).toBe('原始模态') // 未被覆盖
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('不同插件同短 id 不冲突：demo:modal 与 other:modal 共存', () => {
    const registry = useUiRegistryStore()
    expect(registry.registerPluginModal('demo', dummyModal({ title: 'demo 的' }))).toEqual({ ok: true })
    expect(registry.registerPluginModal('other', dummyModal({ title: 'other 的' }))).toEqual({ ok: true })

    expect(registry.modals.get('demo:modal')!.def.title).toBe('demo 的')
    expect(registry.modals.get('other:modal')!.def.title).toBe('other 的')
    expect(registry.modals.size).toBe(2)
  })

  it('removePlugin 只清理对应插件条目，其它插件保留；reset 一并清空；其它表不受影响', () => {
    const registry = useUiRegistryStore()
    // 注册 modals 前记录其它表现状（内置 seed + 无插件条目）
    const panelsSizeBefore = registry.panels.size

    registry.registerPluginModal('demo', dummyModal())
    registry.registerPluginModal('other', dummyModal({ id: 'modal2' }))
    // 顺手注册一条其它表条目，验证 removePlugin 不误伤非 modals 表的 demo 条目之外的场景在其余用例覆盖
    registry.registerPluginShortcutAction('demo', dummyShortcutAction())

    registry.removePlugin('demo')
    expect(registry.modals.has('demo:modal')).toBe(false)
    expect(registry.modals.has('other:modal2')).toBe(true) // 其它插件保留
    expect(registry.shortcutActions.has('demo:act')).toBe(false) // 同插件其它表条目一并清理

    // modals 注册/清理不影响面板表（内置 seed 条目数量不变）
    expect(registry.panels.size).toBe(panelsSizeBefore)

    registry.reset()
    expect(registry.modals.size).toBe(0)
  })

  it('rollbackPluginUi：清掉该插件 modals 条目（经 removePlugin 自动覆盖）', () => {
    const ui = createPluginRegister('demo')
    expect(ui.registerModal(dummyModal())).toEqual({ ok: true })
    expect(useUiRegistryStore().modals.has('demo:modal')).toBe(true)

    rollbackPluginUi('demo')
    expect(useUiRegistryStore().modals.has('demo:modal')).toBe(false)
  })

  it('经 PluginRegisterApi.registerModal：透传 ok/conflict，非法短 id 返回 conflict:"id"', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ui = createPluginRegister('demo')
    expect(ui.registerModal(dummyModal())).toEqual({ ok: true })
    expect(useUiRegistryStore().modals.has('demo:modal')).toBe(true)

    expect(ui.registerModal(dummyModal({ id: 'bad:id' })))
      .toEqual({ ok: false, conflict: 'id' })
    expect(ui.registerModal(dummyModal())).toEqual({ ok: false, conflict: 'id' })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('uiRegistry 浮动层表：登记 / 冲突 / 清理', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('registerPluginFloatingLayer：成功返回 true，key 归一 demo:float，条目含 origin/pluginId/component', () => {
    const registry = useUiRegistryStore()
    expect(registry.registerPluginFloatingLayer('demo', { id: 'float', component: Icon })).toBe(true)

    const entry = registry.floatingLayers.get('demo:float')
    expect(entry).toBeDefined()
    expect(entry!.key).toBe('demo:float')
    expect(entry!.origin).toBe('plugin')
    expect(entry!.pluginId).toBe('demo')
    // reactive Map 深响应式会代理组件对象；断言存在性而非同一引用
    expect(entry!.component).toBeTruthy()
  })

  it('短 id 非法（空 / 含 : / 含空白）→ warn + false，不入表', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = useUiRegistryStore()

    expect(registry.registerPluginFloatingLayer('demo', { id: '', component: Icon })).toBe(false)
    expect(registry.registerPluginFloatingLayer('demo', { id: 'a:b', component: Icon })).toBe(false)
    expect(registry.registerPluginFloatingLayer('demo', { id: 'a b', component: Icon })).toBe(false)

    expect(registry.floatingLayers.size).toBe(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('key 冲突：同插件内同短 id 重复注册 → warn + false，component 不被覆盖', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = useUiRegistryStore()
    const first = defineComponent({ name: 'FirstLayer', setup: () => () => h('div') })
    const second = defineComponent({ name: 'SecondLayer', setup: () => () => h('div') })
    expect(registry.registerPluginFloatingLayer('demo', { id: 'float', component: first })).toBe(true)

    expect(registry.registerPluginFloatingLayer('demo', { id: 'float', component: second })).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()

    // 条目仍为首次注册的组件（未被覆盖；代理对象下按组件名区分）
    expect((registry.floatingLayers.get('demo:float')!.component as { name?: string }).name).toBe('FirstLayer')
  })

  it('不同插件同短 id 不冲突：demo:float 与 other:float 共存', () => {
    const registry = useUiRegistryStore()
    expect(registry.registerPluginFloatingLayer('demo', { id: 'float', component: Icon })).toBe(true)
    expect(registry.registerPluginFloatingLayer('other', { id: 'float', component: Icon })).toBe(true)
    expect(registry.floatingLayers.size).toBe(2)
  })

  it('removePlugin 清理对应插件条目，其它插件保留；reset 一并清空；不误伤其它表', () => {
    const registry = useUiRegistryStore()
    const panelsSizeBefore = registry.panels.size

    registry.registerPluginFloatingLayer('demo', { id: 'float', component: Icon })
    registry.registerPluginFloatingLayer('other', { id: 'float', component: Icon })
    registry.registerPluginModal('demo', dummyModal())

    registry.removePlugin('demo')
    expect(registry.floatingLayers.has('demo:float')).toBe(false)
    expect(registry.floatingLayers.has('other:float')).toBe(true) // 其它插件保留
    expect(registry.modals.has('demo:modal')).toBe(false) // 同插件其它表条目一并清理
    expect(registry.panels.size).toBe(panelsSizeBefore) // 不误伤面板表（内置 seed 条目数量不变）

    registry.reset()
    expect(registry.floatingLayers.size).toBe(0)
  })

  it('rollbackPluginUi 覆盖浮动层：清掉该插件条目（经 removePlugin 统一清理）', () => {
    const ui = createPluginRegister('demo')
    ui.registerFloatingLayer({ id: 'float', component: Icon })
    expect(useUiRegistryStore().floatingLayers.has('demo:float')).toBe(true)

    rollbackPluginUi('demo')
    expect(useUiRegistryStore().floatingLayers.has('demo:float')).toBe(false)
  })

  it('经 PluginRegisterApi.registerFloatingLayer：非法短 id / 冲突 → warn + 跳过（返回 void）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ui = createPluginRegister('demo')
    ui.registerFloatingLayer({ id: 'float', component: Icon })
    expect(useUiRegistryStore().floatingLayers.has('demo:float')).toBe(true)

    // 返回 void（对齐 registerPanel）：非法 / 冲突仅 warn + 不入表
    expect(ui.registerFloatingLayer({ id: 'bad:id', component: Icon })).toBeUndefined()
    expect(ui.registerFloatingLayer({ id: 'float', component: Icon })).toBeUndefined()
    expect(useUiRegistryStore().floatingLayers.size).toBe(1)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
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