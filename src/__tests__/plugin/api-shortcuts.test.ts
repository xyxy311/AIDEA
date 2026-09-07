import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createShortcutsApi } from '@/plugin/api/shortcuts'
import { createPluginRegister } from '@/plugin/ui'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { useShortcutsStore } from '@/stores/shortcuts'
import { RESERVED_CHORDS } from '@/constants/shortcuts'
import type { PluginShortcutActionRegistration } from '@/plugin/ui'

/**
 * 快捷键动作注册 + 查询测试：
 * - 注册走注册面 createPluginRegister('demo').registerShortcutAction（自 api.shortcuts 迁移），
 *   校验顺序（短 id → key 冲突 → defaultChord）与登记落位（uiRegistry.shortcutActions）不变。
 * - api.shortcuts 仅只读查询（无 registerAction），经 createShortcutsApi() 构造。
 */
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

describe('注册面 registerShortcutAction（per-plugin）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('注册成功 → { ok:true }，登记进 uiRegistry，getBinding / bindings 反映默认键', () => {
    const register = createPluginRegister('demo')
    const api = createShortcutsApi()
    const res = register.registerShortcutAction(dummyAction())
    expect(res).toEqual({ ok: true })

    const registry = useUiRegistryStore()
    expect(registry.shortcutActions.has('demo:act')).toBe(true)
    // 注册后 getBinding(key) 返回 default；bindings() 含之
    expect(api.getBinding('demo:act')).toBe('mod+shift+g')
    expect(api.bindings()['demo:act']).toBe('mod+shift+g')
    // findActionByChord 命中插件动作返回完整 key
    expect(api.findActionByChord('mod+shift+g')).toBe('demo:act')
  })

  it('无 defaultChord 的动作：注册成功但 getBinding 返回空串（不在 bindings 中）', () => {
    const register = createPluginRegister('demo')
    const api = createShortcutsApi()
    expect(register.registerShortcutAction(dummyAction({ defaultChord: undefined }))).toEqual({ ok: true })
    expect(api.getBinding('demo:act')).toBe('')
    expect(api.bindings()['demo:act']).toBeUndefined()
  })

  it('短 id 非法 → warn + conflict:"id"，不入表', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const register = createPluginRegister('demo')
    for (const badId of ['', 'a:b', 'a b']) {
      expect(register.registerShortcutAction(dummyAction({ id: badId }))).toEqual({ ok: false, conflict: 'id' })
    }
    expect(useUiRegistryStore().shortcutActions.size).toBe(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('key 冲突（同 key 二次注册）→ warn + conflict:"id"，def 不被覆盖', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const register = createPluginRegister('demo')
    register.registerShortcutAction(dummyAction({ label: '原始' }))
    expect(register.registerShortcutAction(dummyAction({ label: '新的' }))).toEqual({ ok: false, conflict: 'id' })
    expect(useUiRegistryStore().shortcutActions.get('demo:act')!.def.label).toBe('原始')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('defaultChord 为保留键 → warn + conflict:"chord"，不入表', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const register = createPluginRegister('demo')
    expect(register.registerShortcutAction(dummyAction({ defaultChord: RESERVED_CHORDS[0] }))) // mod+z
      .toEqual({ ok: false, conflict: 'chord' })
    expect(useUiRegistryStore().shortcutActions.size).toBe(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('defaultChord 与内置动作当前生效绑定冲突 → conflict:"chord"', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const register = createPluginRegister('demo')
    // 内置 save 默认 mod+s
    expect(register.registerShortcutAction(dummyAction({ defaultChord: 'mod+s' })))
      .toEqual({ ok: false, conflict: 'chord' })
    warn.mockRestore()
  })

  it('defaultChord 与已注册插件动作绑定冲突 → conflict:"chord"', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const register = createPluginRegister('demo')
    register.registerShortcutAction(dummyAction({ id: 'first', defaultChord: 'mod+shift+g' }))
    expect(register.registerShortcutAction(dummyAction({ id: 'second', defaultChord: 'mod+shift+g' })))
      .toEqual({ ok: false, conflict: 'chord' })
    expect(useUiRegistryStore().shortcutActions.has('demo:second')).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('非法 defaultChord（纯修饰键等）→ conflict:"chord"', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const register = createPluginRegister('demo')
    expect(register.registerShortcutAction(dummyAction({ defaultChord: 'mod' })))
      .toEqual({ ok: false, conflict: 'chord' })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('api.shortcuts 仅查询：无 registerAction（注册已移至 ctx.register）', () => {
    const api = createShortcutsApi()
    expect('registerAction' in api).toBe(false)
    // 只读查询不受影响
    expect(api.getBinding('save')).toBe('mod+s')
    expect(api.listActions().length).toBeGreaterThan(0)
    expect(api.isReserved('delete')).toEqual({ reserved: true })
  })

  it('findActionByChord：内置命中返回短 id，插件命中返回完整 key，未命中 null', () => {
    const register = createPluginRegister('demo')
    const api = createShortcutsApi()
    expect(api.findActionByChord('mod+s')).toBe('save')
    register.registerShortcutAction(dummyAction())
    expect(api.findActionByChord('mod+shift+g')).toBe('demo:act')
    expect(api.findActionByChord('no+such+chord')).toBeNull()
  })
})

describe('shortcuts store：注册插件动作后的只读查询', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('注册后 shortcuts store 的 getBinding / bindings 含插件默认键（覆盖优先）', () => {
    const registry = useUiRegistryStore()
    const shortcuts = useShortcutsStore()
    registry.registerPluginShortcutAction('demo', dummyAction())
    expect(shortcuts.getBinding('demo:act')).toBe('mod+shift+g')
    expect(shortcuts.bindings['demo:act']).toBe('mod+shift+g')

    // 用户覆盖优先于 defaultChord
    shortcuts.assign('demo:act', 'j')
    expect(shortcuts.getBinding('demo:act')).toBe('j')
  })

  it('assign 撞插件动作当前绑定被拒，conflict.id 为完整 key，labelKey 为成品 label', () => {
    const registry = useUiRegistryStore()
    const shortcuts = useShortcutsStore()
    registry.registerPluginShortcutAction('demo', dummyAction()) // defaultChord mod+shift+g

    const r = shortcuts.assign('enterChild', 'mod+shift+g')
    expect(r.ok).toBe(false)
    if (!r.ok && typeof r.conflict === 'object') {
      expect(r.conflict.id).toBe('demo:act')
      expect(r.conflict.labelKey).toBe('演示动作')
    } else {
      throw new Error('应返回对象冲突')
    }
  })

  it('assign 支持给插件动作完整 key 改键', () => {
    const registry = useUiRegistryStore()
    const shortcuts = useShortcutsStore()
    registry.registerPluginShortcutAction('demo', dummyAction())
    expect(shortcuts.assign('demo:act', 'j')).toEqual({ ok: true })
    expect(shortcuts.getBinding('demo:act')).toBe('j')
    // 恢复默认（reset 对完整 key 直接工作）
    shortcuts.reset('demo:act')
    expect(shortcuts.getBinding('demo:act')).toBe('mod+shift+g')
  })

  it('validate 保留含 ":" 的插件命名空间覆盖（动作不在表也不清），清理未知非命名空间 key', () => {
    localStorage.setItem(
      'aidea-shortcuts',
      JSON.stringify({ 'demo:act': 'j', not_exist: 'x', enterChild: 'mod' }),
    )
    const shortcuts = useShortcutsStore()
    // 插件命名空间覆盖保留（即便 demo:act 尚未注册）
    expect(shortcuts.overrides['demo:act']).toBe('j')
    // 未知非命名空间 key 与非法值仍被清理
    expect(shortcuts.overrides.not_exist).toBeUndefined()
    expect(shortcuts.overrides.enterChild).toBeUndefined()
  })

  it('插件卸载（removePlugin）后 bindings 不再含其默认键，但覆盖保留', () => {
    const registry = useUiRegistryStore()
    const shortcuts = useShortcutsStore()
    registry.registerPluginShortcutAction('demo', dummyAction())
    shortcuts.assign('demo:act', 'j')
    expect(shortcuts.getBinding('demo:act')).toBe('j')

    registry.removePlugin('demo')
    // 动作不在表 → bindings 不含（getBinding 回退空串）
    expect(shortcuts.bindings['demo:act']).toBeUndefined()
    expect(shortcuts.getBinding('demo:act')).toBe('')
    // validate 后覆盖仍保留（含 ':' 跳过清理）
    shortcuts.validate()
    expect(shortcuts.overrides['demo:act']).toBe('j')
  })
})
