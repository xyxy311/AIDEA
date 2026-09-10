import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { usePluginConfigStore } from '@/stores/pluginConfig'
import { CUSTOM_SHORTCUTS, RESERVED_CHORDS } from '@/constants/shortcuts'

/** 清理插件配置独立存储（插件快捷键覆盖自本轮起存于 `aidea-plugin-config.<pluginId>`） */
function clearPluginConfigStorage(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('aidea-plugin-config.')) keys.push(k)
  }
  for (const k of keys) localStorage.removeItem(k)
}

function freshStore() {
  return useShortcutsStore()
}

describe('shortcuts store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // 清理测试环境中的持久化
    localStorage.removeItem('aidea-shortcuts')
    localStorage.removeItem('aidea-shortcuts-seqmod')
    clearPluginConfigStorage()
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

  it('assign 到方向键 / Enter 锁定键被拒绝（conflict=locked）', () => {
    const s = freshStore()
    // 方向键 chord 为规范化后的 up/down/left/right（utils/shortcuts KEY_ALIAS），Enter 为 enter
    expect(s.assign('enterChild', 'enter')).toMatchObject({ ok: false, conflict: 'locked' })
    expect(s.assign('enterChild', 'up')).toMatchObject({ ok: false, conflict: 'locked' })
    expect(s.assign('enterChild', 'down')).toMatchObject({ ok: false, conflict: 'locked' })
    expect(s.assign('enterChild', 'left')).toMatchObject({ ok: false, conflict: 'locked' })
    expect(s.assign('enterChild', 'right')).toMatchObject({ ok: false, conflict: 'locked' })
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
    clearPluginConfigStorage()
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

  it('迁移先行：旧混存含 ":" 条目搬入插件配置文件，validate 丢弃残留而非保留', async () => {
    localStorage.setItem('aidea-shortcuts', JSON.stringify({ 'demo:act': 'j', not_exist: 'x' }))
    const s = freshStore() // store 创建时先迁移（同步写各插件文件）后 validate
    // 迁移先行：demo:act 搬入插件配置（未被 validate 误删）
    expect(JSON.parse(localStorage.getItem('aidea-plugin-config.demo')!).shortcuts).toEqual({ act: 'j' })
    // validate 丢弃含 ':' 残留 + 非命名空间未知 id 仍清理（内存即时）
    expect(s.overrides['demo:act']).toBeUndefined()
    expect(s.overrides.not_exist).toBeUndefined()
    await nextTick() // validate 的清理写回（useStorage pre flush）
    expect(JSON.parse(localStorage.getItem('aidea-shortcuts')!)).toEqual({})
    // 合并后 bindings 生效（registry 未登记 demo:act → 未知 key 忽略，bindings 不含）
    expect(s.bindings['demo:act']).toBeUndefined()
  })

  it('迁移后内置覆盖条目留在原处：aidea-shortcuts 裁剪版原样保留、无插件条目则不建插件文件', () => {
    localStorage.setItem('aidea-shortcuts', JSON.stringify({ save: 'mod+shift+s' }))
    const s = freshStore()
    // 无含 ':' 条目 → 不建任何插件文件，内置覆盖原样保留
    expect(localStorage.getItem('aidea-plugin-config.demo')).toBeNull()
    expect(JSON.parse(localStorage.getItem('aidea-shortcuts')!)).toEqual({ save: 'mod+shift+s' })
    expect(s.overrides).toEqual({ save: 'mod+shift+s' })
    // validate 不触碰内置覆盖
    s.validate()
    expect(s.overrides).toEqual({ save: 'mod+shift+s' })
  })

  it('assign 插件完整 key：覆盖落 pluginConfig 独立存储，aidea-shortcuts 无 ":" 条目', async () => {
    registerDemoAction()
    const s = freshStore()
    expect(s.assign('demo:act', 'j')).toEqual({ ok: true })
    // 内存即时生效（reactive，无需等待落盘）
    expect(s.getBinding('demo:act')).toBe('j')
    await nextTick() // pluginConfig 深度 watch 落盘（默认 pre flush）
    expect(JSON.parse(localStorage.getItem('aidea-plugin-config.demo')!).shortcuts).toEqual({ act: 'j' })
    // 内置覆盖持久化文件不含任何 ':' 条目
    const legacy = JSON.parse(localStorage.getItem('aidea-shortcuts') ?? '{}') as Record<string, string>
    expect(Object.keys(legacy).some((k) => k.includes(':'))).toBe(false)
  })

  it('reset 完整 key：删 pluginConfig 单条覆盖（actionId 不含前缀），回 defaultChord', async () => {
    registerDemoAction()
    const s = freshStore()
    s.assign('demo:act', 'j')
    s.reset('demo:act')
    expect(s.getBinding('demo:act')).toBe('mod+shift+g') // 内存立即回默认
    await nextTick()
    expect(JSON.parse(localStorage.getItem('aidea-plugin-config.demo')!).shortcuts).toEqual({})
  })

  it('resetAll 清两源：内置覆盖 + 全部插件覆盖（含未注册动作的插件）', async () => {
    registerDemoAction()
    const s = freshStore()
    s.assign('enterChild', 'x')
    s.assign('demo:act', 'j')
    // 未注册动作的插件覆盖也在清空范围（全量重置语义）
    usePluginConfigStore().setShortcutOverride('ghost', 'greet', 'k')
    s.resetAll()
    expect(s.overrides).toEqual({})
    expect(s.getBinding('demo:act')).toBe('mod+shift+g')
    await nextTick()
    expect(JSON.parse(localStorage.getItem('aidea-plugin-config.demo')!).shortcuts).toEqual({})
    expect(JSON.parse(localStorage.getItem('aidea-plugin-config.ghost')!).shortcuts).toEqual({})
  })

  it('bindings 合并插件覆盖；未注册动作的覆盖条目被忽略（未知 key 规则不变）', () => {
    registerDemoAction()
    const s = freshStore()
    // 直接写入 pluginConfig 的覆盖（模拟迁移产物）
    usePluginConfigStore().setShortcutOverride('demo', 'act', 'j')
    usePluginConfigStore().setShortcutOverride('demo', 'ghost', 'k') // 未注册动作
    expect(s.getBinding('demo:act')).toBe('j')
    expect(s.bindings['demo:ghost']).toBeUndefined()
    // 内置覆盖与插件覆盖互不影响
    s.assign('enterChild', 'x')
    expect(s.getBinding('enterChild')).toBe('x')
    expect(s.getBinding('demo:act')).toBe('j')
  })

  it('插件卸载后 bindings 不再含其默认键，但覆盖保留在独立存储（重装恢复）', async () => {
    registerDemoAction()
    const s = freshStore()
    s.assign('demo:act', 'j')
    await nextTick()
    // 卸载动作 → bindings 不含（默认与覆盖均被未知 key 规则忽略）
    useUiRegistryStore().removePlugin('demo')
    expect(s.bindings['demo:act']).toBeUndefined()
    // shortcuts store 的 validate 不触碰独立存储：覆盖仍在插件配置文件
    s.validate()
    await nextTick()
    expect(JSON.parse(localStorage.getItem('aidea-plugin-config.demo')!).shortcuts).toEqual({ act: 'j' })
  })
})