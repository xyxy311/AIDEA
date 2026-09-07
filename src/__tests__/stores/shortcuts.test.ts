import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { CUSTOM_SHORTCUTS, RESERVED_CHORDS } from '@/constants/shortcuts'

function freshStore() {
  return useShortcutsStore()
}

describe('shortcuts store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // 清理测试环境中的持久化
    localStorage.removeItem('aidea-shortcuts')
    localStorage.removeItem('aidea-shortcuts-seqmod')
  })

  it('默认绑定来自注册表', () => {
    const s = freshStore()
    for (const def of CUSTOM_SHORTCUTS) {
      expect(s.getBinding(def.id)).toBe(def.default)
    }
  })

  it('序号修饰键默认 t', () => {
    expect(freshStore().seqModKey).toBe('t')
  })

  it('assign 成功并覆盖绑定', () => {
    const s = freshStore()
    const r = s.assign('enterChild', 'x')
    expect(r).toEqual({ ok: true })
    expect(s.getBinding('enterChild')).toBe('x')
  })

  it('assign 与锁定键冲突被拒绝', () => {
    const s = freshStore()
    const r = s.assign('enterChild', RESERVED_CHORDS[0]) // mod+z
    expect(r.ok).toBe(false)
    expect(s.getBinding('enterChild')).toBe('a') // 保持原值
  })

  it('assign 与其它自定义动作冲突被拒绝并返回冲突方', () => {
    const s = freshStore()
    s.assign('enterChild', 'q') // 与 enterParent 的默认 q 冲突
    const r = s.assign('enterChild', 'q')
    expect(r).toMatchObject({ ok: false, conflict: { id: 'enterParent' } })
    expect(s.getBinding('enterChild')).toBe('a')
  })

  it('assign 非法输入被拒绝', () => {
    const s = freshStore()
    const r = s.assign('enterChild', 'mod')
    expect(r.ok).toBe(false)
  })

  it('assign 裸单键与序号修饰键冲突被拒绝', () => {
    const s = freshStore()
    s.setSeqModKey('b')
    const r = s.assign('enterChild', 'b')
    expect(r).toMatchObject({ ok: false, conflict: 'seqMod' })
    expect(s.getBinding('enterChild')).toBe('a')
  })

  it('reset 恢复默认', () => {
    const s = freshStore()
    s.assign('enterChild', 'x')
    s.reset('enterChild')
    expect(s.getBinding('enterChild')).toBe('a')
  })

  it('resetAll 清空全部覆盖', () => {
    const s = freshStore()
    s.assign('enterChild', 'x')
    s.assign('aiClear', 'k')
    s.resetAll()
    for (const def of CUSTOM_SHORTCUTS) {
      expect(s.getBinding(def.id)).toBe(def.default)
    }
  })

  it('setSeqModKey 拒绝数字与组合键', () => {
    const s = freshStore()
    s.setSeqModKey('5')
    expect(s.seqModKey).toBe('t')
    s.setSeqModKey('mod+x')
    expect(s.seqModKey).toBe('t')
    s.setSeqModKey('b')
    expect(s.seqModKey).toBe('b')
  })

  it('setSeqModKey 与自定义动作裸单键冲突被拒绝', () => {
    const s = freshStore()
    // aiClear 默认裸单键 c
    const r = s.setSeqModKey('c')
    expect(r).toMatchObject({ ok: false, reason: 'custom', conflict: { id: 'aiClear' } })
    expect(s.seqModKey).toBe('t')
  })

  it('setSeqModKey 与锁定单键冲突被拒绝', () => {
    const s = freshStore()
    const r = s.setSeqModKey('escape') // escape 单键被锁定
    expect(r).toMatchObject({ ok: false, reason: 'locked' })
    expect(s.seqModKey).toBe('t')
  })

  it('setSeqModKey 正常设置', () => {
    const s = freshStore()
    expect(s.setSeqModKey('b')).toEqual({ ok: true })
    expect(s.seqModKey).toBe('b')
  })

  it('自愈：忽略未知 id 与非法值', () => {
    localStorage.setItem('aidea-shortcuts', JSON.stringify({ not_exist: 'x', enterChild: 'mod' }))
    const s = freshStore()
    expect(s.getBinding('enterChild')).toBe('a')
    expect(s.overrides.not_exist).toBeUndefined()
  })
})

describe('shortcuts store：插件注册动作（经 uiRegistry 登记）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.removeItem('aidea-shortcuts')
    localStorage.removeItem('aidea-shortcuts-seqmod')
  })

  /** 经 uiRegistry 登记一个带默认键的插件动作 */
  function registerDemoAction(defaultChord = 'mod+shift+g'): void {
    useUiRegistryStore().registerPluginShortcutAction('demo', {
      id: 'act',
      label: '演示动作',
      scope: 'canvas',
      defaultChord,
      run: () => undefined,
    })
  }

  it('注册插件动作后 bindings 含其 default（无覆盖时）', () => {
    registerDemoAction()
    const s = freshStore()
    expect(s.bindings['demo:act']).toBe('mod+shift+g')
    expect(s.getBinding('demo:act')).toBe('mod+shift+g')
  })

  it('无 defaultChord 的插件动作不进 bindings（getBinding 空串）', () => {
    useUiRegistryStore().registerPluginShortcutAction('demo', {
      id: 'bare',
      label: '无默认键动作',
      scope: 'canvas',
      run: () => undefined,
    })
    const s = freshStore()
    expect(s.bindings['demo:bare']).toBeUndefined()
    expect(s.getBinding('demo:bare')).toBe('')
  })

  it('assign 撞插件动作绑定被拒（conflict.id = 完整 key，labelKey = 成品 label）', () => {
    registerDemoAction()
    const s = freshStore()
    const r = s.assign('enterChild', 'mod+shift+g')
    expect(r.ok).toBe(false)
    if (!r.ok && typeof r.conflict === 'object') {
      expect(r.conflict.id).toBe('demo:act')
      expect(r.conflict.labelKey).toBe('演示动作')
    } else {
      throw new Error('应返回对象冲突')
    }
  })

  it('assign 对插件动作完整 key 可改键，且反向挡住内置动作撞插件绑定', () => {
    registerDemoAction()
    const s = freshStore()
    // 给插件动作改键
    expect(s.assign('demo:act', 'j')).toEqual({ ok: true })
    expect(s.getBinding('demo:act')).toBe('j')
    // 内置动作撞插件动作的当前绑定 → 拒绝
    expect(s.assign('aiClear', 'j').ok).toBe(false)
    // 恢复默认（reset 对完整 key 直接工作）
    s.reset('demo:act')
    expect(s.getBinding('demo:act')).toBe('mod+shift+g')
  })

  it('validate 不清含 ":" 的插件命名空间覆盖（动作不在表也保留）', () => {
    localStorage.setItem('aidea-shortcuts', JSON.stringify({ 'demo:act': 'j', not_exist: 'x' }))
    const s = freshStore() // store 创建时自动 validate
    expect(s.overrides['demo:act']).toBe('j') // 插件命名空间保留
    expect(s.overrides.not_exist).toBeUndefined() // 非命名空间未知 id 仍清理

    // 卸载动作后手动 validate，覆盖依旧保留
    useUiRegistryStore().removePlugin('demo')
    s.validate()
    expect(s.overrides['demo:act']).toBe('j')
  })
})