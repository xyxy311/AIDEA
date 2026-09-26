import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { adapter, SDK_VERSION } from '@/plugin/adapter'
import { createPluginRegister } from '@/plugin/ui'
import { useAdditionsStore } from '@/stores/additions'
import { useModalStore } from '@/stores/modal'
import { ROOT_NODE_ID } from '@/stores/node'

/** 测试用最小插件模态内容组件 */
const DummyComp = defineComponent(() => () => null)

/** 适配层单例契约 + 分类 api 测试（单例、for(id) 作用域、undo/redo、batch） */
function makeApi() {
  return adapter.api
}

describe('adapter 单例契约', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('exposes sdkVersion + all categorized api groups (without additions)', () => {
    expect(adapter.sdkVersion).toBe(SDK_VERSION)
    const domains = [
      'node',
      'connection',
      'tag',
      'project',
      'view',
      'presets',
      'theme',
      'file',
      'shortcuts',
      'i18n',
    ]
    for (const key of domains) {
      expect(adapter.api).toHaveProperty(key)
    }
    // additions 已移出共享 api：仅经 for(id) 的 PluginScope 提供
    expect(adapter.api).not.toHaveProperty('additions')
  })

  it('for：非法 id（空 / 含冒号）抛错', () => {
    expect(() => adapter.for('')).toThrow()
    expect(() => adapter.for('a:b')).toThrow()
  })

  it('for：同 id 重复调用返回同一实例（模块级缓存）', () => {
    expect(adapter.for('dup')).toBe(adapter.for('dup'))
  })

  it('for：scope.modal 与 ctx.modal 同构——形状、随 for 缓存、短 id 拼前缀接线', () => {
    const scope = adapter.for('modaltest')
    // 形状：open / close 均为函数（与 ctx.modal 同一工厂产物）
    expect(typeof scope.modal.open).toBe('function')
    expect(typeof scope.modal.close).toBe('function')
    // 缓存：同 id 重复 for → 同一 modal 实例（随 scope 一起缓存）
    expect(adapter.for('modaltest').modal).toBe(scope.modal)

    // 入口校验（for 位与 ctx 位同一工厂）：未登记的短 id → false
    expect(scope.modal.open('about')).toBe(false)

    // 接线：登记后短 id 自动拼 `${pluginId}:` 前缀（工厂行为细节由 ctx-modal.test.ts 覆盖）
    expect(createPluginRegister('modaltest').registerModal({ id: 'about', title: '演示模态', component: DummyComp }))
      .toEqual({ ok: true })
    expect(scope.modal.open('about')).toBe(true)
    expect(useModalStore().activeKey).toBe('modaltest:about')
    scope.modal.close()
    expect(useModalStore().activeKey).toBeNull()
  })

  it('scope.additions：命名空间前缀隔离与写校验', () => {
    const a = adapter.for('p1').additions
    const b = adapter.for('p2').additions

    // 写入完整键带插件前缀（写校验：经 store 直查）
    a.set('k', 'v1')
    expect(useAdditionsStore().has('p1:k')).toBe(true)
    expect(a.get('k')).toBe('v1')
    expect(a.keys()).toEqual(['k'])

    // 跨插件不可见
    expect(b.has('k')).toBe(false)
    expect(b.get('k')).toBeUndefined()
    expect(b.keys()).toEqual([])

    // key 含冒号 → 抛错（不能伪造其他插件命名空间），且不越界写入
    expect(() => a.set('x:y', 1)).toThrow()
    expect(() => a.remove('x:y')).toThrow()
    expect(useAdditionsStore().has('p1:x:y')).toBe(false)
  })
})

describe('adapter 分类 api', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('presets: lists builtin node/connection presets (first-run defaults)', () => {
    const api = makeApi()
    // 首次加载 initDefaults 会用默认预设初始化，故至少有一条
    expect(api.presets.nodePresets().length).toBeGreaterThan(0)
    expect(api.presets.connectionPresets().length).toBeGreaterThan(0)
    // 预设 ID 与可见列表一致
    const first = api.presets.nodePresets()[0]
    expect(api.presets.visibleNodePresets().map((p) => p.id)).toContain(first.id)
  })

  it('node: applyPresetById writes a style and is undoable', () => {
    const api = makeApi()
    const id = api.node.create(ROOT_NODE_ID, 0, 0, 'n')
    const initial = api.node.get(id)!.borderColor
    // 选一个与初始色不同的预设，确保 apply 后 undo 可区分恢复
    const preset =
      api.presets.nodePresets().find((p) => p.borderColor !== initial) ??
      api.presets.nodePresets()[0]
    expect(api.node.applyPresetById(id, preset.id, 'plugin-test')).toBe(true)
    expect(api.node.get(id)?.borderColor).toBe(preset.borderColor)
    api.project.undo()
    expect(api.node.get(id)?.borderColor).not.toBe(preset.borderColor)
  })

  it('theme: initial light mode with a scheme snapshot; setMode round-trip', () => {
    const api = makeApi()
    expect(api.theme.mode()).toBe('light')
    expect(api.theme.isDark()).toBe(false)
    expect(typeof api.theme.schemeId()).toBe('string')
    expect(api.theme.scheme().id).toBe(api.theme.schemeId())
    api.theme.setMode('dark')
    expect(api.theme.mode()).toBe('dark')
    expect(api.theme.isDark()).toBe(true)
    api.theme.setMode('light')
  })

  it('file: serializeCurrent emits JSON; parse round-trips', () => {
    const api = makeApi()
    const json = api.file.serializeCurrent()
    expect(typeof json).toBe('string')
    expect(json.startsWith('{')).toBe(true)
    expect(api.file.dirty()).toBe(false)
    const parsed = api.file.parse(json)
    expect(parsed.nodes.length).toBeGreaterThan(0)
  })

  it('shortcuts: queries effective bindings and action list', () => {
    const api = makeApi()
    expect(api.shortcuts.getBinding('save')).toBe('mod+s')
    expect(api.shortcuts.seqModKey()).toBe('t')
    expect(api.shortcuts.isReserved('delete')).toEqual({ reserved: true })
    expect(api.shortcuts.listActions().length).toBeGreaterThan(0)
    expect(api.shortcuts.findActionByChord('mod+s')).toBe('save')
  })

  it('i18n: exposes getLocale / host t / createT factory for plugin-owned bundles', () => {
    const api = makeApi()
    expect(typeof api.i18n.getLocale).toBe('function')
    expect(typeof api.i18n.t).toBe('function')
    // createT 工厂：传插件自有语言包得到独立 t（文案归插件文件夹，宿主 locales 不托管）
    expect(typeof api.i18n.createT).toBe('function')
    const tr = api.i18n.createT({ 'zh-CN': { greet: '你好 {name}' } })
    // 当前语言或回退链命中插件包 zh-CN 表 + {name} 插值
    expect(tr('greet', { name: '插件' })).toBe('你好 插件')
    // 回退链末端：两级均未命中返回 key 本身
    expect(tr('no.such.key')).toBe('no.such.key')
  })

  it('node query: root exists, empty initially', () => {
    const api = makeApi()
    expect(api.node.get(ROOT_NODE_ID)).toBeDefined()
    expect(api.node.hasChildren(ROOT_NODE_ID)).toBe(false)
    expect(api.node.children(ROOT_NODE_ID)).toEqual([])
    expect(api.view.active()).toEqual({ viewedNodeId: ROOT_NODE_ID, isMain: true })
    expect(api.view.selection()).toEqual({ nodeIds: [], connectionIds: [] })
    expect(api.tag.list()).toEqual([])
  })

  it('node.create creates a child and is undoable via project.undo', () => {
    const api = makeApi()
    const id = api.node.create(ROOT_NODE_ID, 10, 20, '甲')
    expect(api.node.hasChildren(ROOT_NODE_ID)).toBe(true)
    expect(api.node.children(ROOT_NODE_ID).map((n) => n.id)).toContain(id)

    api.project.undo()
    expect(api.node.get(id)).toBeNull()
    api.project.redo()
    expect(api.node.get(id)?.text).toBe('甲')
  })

  it('node.setText updates text and is undoable', () => {
    const api = makeApi()
    const id = api.node.create(ROOT_NODE_ID, 0, 0, '旧')
    const r = api.node.setText(id, '新')
    expect(r.ok).toBe(true)
    expect(api.node.get(id)?.text).toBe('新')
    api.project.undo()
    expect(api.node.get(id)?.text).toBe('旧')
  })

  it('view.select/selection round-trip', () => {
    const api = makeApi()
    const id = api.node.create(ROOT_NODE_ID, 0, 0, 'n')
    api.view.select(id)
    expect(api.view.selection().nodeIds).toContain(id)
    api.view.clearSelection()
    expect(api.view.selection().nodeIds).toEqual([])
  })

  it('node.tree visits all nodes (pre-order, root first)', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    api.node.create(a, 0, 0, 'A1')
    api.node.create(a, 0, 0, 'A2')
    const visited: string[] = []
    api.node.tree(({ node, depth }) => {
      visited.push(`${'  '.repeat(depth)}${node.text}`)
    })
    expect(visited[0]).toBe('未命名项目')
    expect(visited.slice(1)).toEqual(['  A', '    A1', '    A2'])
  })

  it('view.stats / project.stats reflect the tree', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    const b = api.node.create(ROOT_NODE_ID, 0, 0, '#B')
    const a1 = api.node.create(a, 0, 0, 'A1')
    expect(api.view.stats().childCount).toBe(2)
    expect(api.view.stats().directReferenceCount).toBe(1)
    expect(api.project.stats().totalNodes).toBe(3) // A, B, A1（不含根）
    expect(api.project.stats().totalReferences).toBe(1)
    expect(api.node.pathToRoot(a)).toEqual([a, ROOT_NODE_ID])
    expect([...api.node.descendants(ROOT_NODE_ID)].sort()).toEqual([ROOT_NODE_ID, a, b, a1].sort())
  })

  it('node.group merges into a single batch history entry', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 100, 100, 'a')
    const b = api.node.create(ROOT_NODE_ID, 300, 100, 'b')
    const containerId = api.node.group([a, b])
    expect(containerId).toBeTruthy()
    expect(api.node.descendants(containerId!)).toContain(a)
    expect(api.node.descendants(containerId!)).toContain(b)
    api.project.undo()
    expect(api.node.get(containerId!)).toBeNull()
    expect(api.node.descendants(ROOT_NODE_ID)).toContain(a)
  })
})
