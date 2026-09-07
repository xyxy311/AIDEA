import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAdditionsStore } from '@/stores/additions'
import { adapter } from '@/plugin/adapter'
import { serializeProject, parseProjectFile, defaultProjectAIConfig } from '@/utils/projectFile'
import { createNode } from '@/utils/factory'
import { ROOT_NODE_ID } from '@/stores/node'
import type { ProjectViewState } from '@/utils/projectFile'

/**
 * additions 域测试：additionsStore + adapter.for(id) 作用域 additions（含 undo/redo）+ projectFile 往返。
 * pinia 初始化沿用 api.test.ts：setActivePinia(createPinia())。
 * 历史控制（undo/redo）经共享 adapter.api 的 project 域驱动——历史控制不分命名空间。
 * additions 仅经 adapter.for(pluginId) 的 PluginScope 提供（共享 api 上无 additions 域）。
 */
function makeAdditions() {
  return adapter.for('hello').additions
}

function makeHistory() {
  return adapter.api.project
}

describe('useAdditionsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('load：仅保留匹配前缀的键（无冒号剔除），值深拷贝', () => {
    const store = useAdditionsStore()
    store.load({ 'hello:counter': { count: 3 }, 'other:key': { a: 1 }, noprefix: 'x' })

    // 只要带 `pluginId:` 前缀的键都保留（additions store 是全局多插件桶）；
    // 无冒号的 `noprefix` 被剔除
    expect(store.keys().sort()).toEqual(['hello:counter', 'other:key'])
    expect(store.has('noprefix')).toBe(false)

    // 深拷贝：改入参对象不影响 store 值
    const raw = { count: 3 }
    store.load({ 'hello:raw': raw })
    raw.count = 99
    expect(store.get('hello:raw')).toEqual({ count: 3 })
  })

  it('applyValue：set 深拷贝写入，undefined 删除', () => {
    const store = useAdditionsStore()
    store.applyValue('hello:k', { n: 1 })
    expect(store.has('hello:k')).toBe(true)
    store.applyValue('hello:k', undefined)
    expect(store.has('hello:k')).toBe(false)
  })

  it('get / has / keys / serialize / clear', () => {
    const store = useAdditionsStore()
    store.load({ 'hello:a': 1, 'hello:b': { x: 2 } })

    expect(store.has('hello:a')).toBe(true)
    expect(store.has('hello:zz')).toBe(false)
    expect(store.get('hello:a')).toBe(1)
    expect(store.keys()).toEqual(['hello:a', 'hello:b'])

    const out = store.serialize()
    expect(out).toEqual({ 'hello:a': 1, 'hello:b': { x: 2 } })
    expect(out).not.toBe(store.entries as unknown as typeof out)

    store.clear()
    expect(store.keys()).toEqual([])
    expect(store.serialize()).toEqual({})
  })
})

describe("adapter.for('hello').additions", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('set：写入完整键 hello:key，插件内 keys 去前缀', () => {
    const api = makeAdditions()
    const store = useAdditionsStore()
    api.set('key', { v: 1 })
    expect(store.has('hello:key')).toBe(true)
    expect(store.has('key')).toBe(false)
    expect(api.get('key')).toEqual({ v: 1 })
    expect(api.keys()).toEqual(['key'])
    expect(api.has('key')).toBe(true)
  })

  it('set 后 undo 恢复旧值；redo 恢复新值', () => {
    const api = makeAdditions()
    const history = makeHistory()
    api.set('key', 'A')
    api.set('key', 'B')
    expect(api.get('key')).toBe('B')

    history.undo()
    expect(api.get('key')).toBe('A')
    history.redo()
    expect(api.get('key')).toBe('B')
  })

  it('remove 后 undo 恢复', () => {
    const api = makeAdditions()
    const history = makeHistory()
    api.set('key', 'X')

    api.remove('key')
    expect(api.get('key')).toBeUndefined()
    history.undo()
    expect(api.get('key')).toBe('X')
    history.redo()
    expect(api.get('key')).toBeUndefined()
  })

  it('key 含冒号 → 抛错，且不越界写入', () => {
    const api = makeAdditions()
    expect(() => api.set('a:b', 1)).toThrow()
    expect(() => api.remove('a:b')).toThrow()
    expect(useAdditionsStore().has('hello:a:b')).toBe(false)
  })

  it('作用域隔离：不同插件的 additions 互不可见；共享 api 上无 additions 域', () => {
    const hello = makeAdditions()
    const other = adapter.for('other').additions
    hello.set('k', 'v')
    expect(other.has('k')).toBe(false)
    expect(other.get('k')).toBeUndefined()
    expect(other.keys()).toEqual([])
    // additions 已移出共享 api（仅经 for(id) 提供）
    expect(adapter.api).not.toHaveProperty('additions')
  })
})

describe('projectFile additions 往返', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('serializeProject 写入的 additions 经 parseProjectFile 后一致；无前缀键被过滤', () => {
    const nodes = [
      createNode({ id: ROOT_NODE_ID, parentId: null, text: '项目' }),
      createNode({ id: 'child1', parentId: ROOT_NODE_ID, text: '子节点' }),
    ]
    const viewState: ProjectViewState = {
      viewedNodeId: ROOT_NODE_ID,
      stageX: 0,
      stageY: 0,
      stageScale: 1,
      expandedIds: [ROOT_NODE_ID],
      inlineViews: [],
      selectedNodeIds: [],
      selectedConnectionIds: [],
    }
    const additions = {
      'hello:counter': { count: 3, note: '来自示例插件' },
      noprefix: '应被过滤',
    }

    const json = serializeProject(nodes, '项目', viewState, [], defaultProjectAIConfig(), additions)
    const parsed = parseProjectFile(json)

    expect(parsed.additions).toEqual({ 'hello:counter': { count: 3, note: '来自示例插件' } })
  })
})