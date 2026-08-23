import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useShortcutsStore } from '@/stores/shortcuts'
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