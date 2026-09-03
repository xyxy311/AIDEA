import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createPluginAdapter, SDK_VERSION } from '@/plugin/adapter'
import { ROOT_NODE_ID } from '@/stores/node'

/**
 * 适配层分类 api 测试（node / connection / tag / project / view）。
 * 只读方法如实反映 store；写方法产生可撤销历史（undo/redo）；batch 合并单条历史。
 */
function makeApi() {
  return createPluginAdapter().api
}

describe('createPluginAdapter 分类 api', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('exposes the adapter + all categorized api groups', () => {
    const adapter = createPluginAdapter()
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
    ]
    for (const key of domains) {
      expect(adapter.api).toHaveProperty(key)
    }
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
    const preset = api.presets.nodePresets()[0]
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