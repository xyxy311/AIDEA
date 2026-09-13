import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { isReactive } from 'vue'
import { createPluginAdapter } from '@/plugin/adapter'
import { ROOT_NODE_ID } from '@/stores/node'
import { DEFAULT_NODE_STYLE, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'

/**
 * 节点域新增 API 测试（命令层写 + 查询扩展）。
 * 写方法应为可撤销历史（undo/redo）；查询方法只读、返回快照。
 */
function makeApi() {
  return createPluginAdapter().api
}

describe('node api 扩展（resize / move / reparent / align / tags / style / reference / tag-query）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('resize: 调整尺寸并可撤销', () => {
    const api = makeApi()
    const id = api.node.create(ROOT_NODE_ID, 0, 0, 'n')
    const before = api.node.get(id)!
    api.node.resize([id], { width: 300, height: 120 })
    expect(api.node.get(id)!.width).toBe(300)
    expect(api.node.get(id)!.height).toBe(120)
    api.project.undo()
    expect(api.node.get(id)!.width).toBe(before.width)
    expect(api.node.get(id)!.height).toBe(before.height)
  })

  it('move: 按增量平移并可撤销', () => {
    const api = makeApi()
    const id = api.node.create(ROOT_NODE_ID, 10, 20, 'm')
    api.node.move([id], { dx: 100, dy: 50 })
    expect(api.node.get(id)!.x).toBe(110)
    expect(api.node.get(id)!.y).toBe(70)
    api.project.undo()
    expect(api.node.get(id)!.x).toBe(10)
    expect(api.node.get(id)!.y).toBe(20)
  })

  it('reparent: 迁移父子关系并可撤销（原位落点）', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'a')
    const b = api.node.create(ROOT_NODE_ID, 0, 0, 'b')
    api.node.reparent([b], a)
    expect(api.node.get(b)!.parentId).toBe(a)
    api.project.undo()
    expect(api.node.get(b)!.parentId).toBe(ROOT_NODE_ID)
  })

  it('reparent: 提供 x/y 落点', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'a')
    const b = api.node.create(ROOT_NODE_ID, 0, 0, 'b')
    api.node.reparent([b], a, 40, 60)
    expect(api.node.get(b)!.parentId).toBe(a)
    expect(api.node.get(b)!.x).toBe(40)
    expect(api.node.get(b)!.y).toBe(60)
  })

  it('alignToGrid: 对齐网格并可撤销', () => {
    const api = makeApi()
    const id = api.node.create(ROOT_NODE_ID, 17, 23, 'g')
    const before = api.node.get(id)!
    api.node.alignToGrid([id])
    api.project.undo()
    expect(api.node.get(id)!.x).toBe(before.x)
    expect(api.node.get(id)!.y).toBe(before.y)
  })

  it('setTags: 统一设置标签并可撤销', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'a')
    const b = api.node.create(ROOT_NODE_ID, 0, 0, 'b')
    api.node.setTags([a, b], ['tag-1'])
    expect(api.node.get(a)!.tagIds).toEqual(['tag-1'])
    expect(api.node.get(b)!.tagIds).toEqual(['tag-1'])
    api.project.undo()
    expect(api.node.get(a)!.tagIds).toEqual([])
  })

  it('setStyle 全字段类型接受 + borderColor 生效并可撤销', () => {
    const api = makeApi()
    const id = api.node.create(ROOT_NODE_ID, 0, 0, 's')
    // 传全 NodeStyle 字段：类型上接受（可选项），store 仅持久化 borderColor
    api.node.setStyle([id], {
      borderColor: '#ff0000',
      borderWidth: 4,
      borderRadius: 8,
      fontSize: 20,
    })
    expect(api.node.get(id)!.borderColor).toBe('#ff0000')
    api.project.undo()
    expect(api.node.get(id)!.borderColor).not.toBe('#ff0000')
  })

  it('applyPresetById: 自建节点预设应用可撤销；预设不存在返回 false', () => {
    const api = makeApi()
    const id = api.node.create(ROOT_NODE_ID, 0, 0, 'n')
    // 自建一个与默认边框色不同的节点预设
    const preset = api.presets.addNodePreset({ name: '测试预设', borderColor: '#abcdef', groupId: null })

    expect(api.node.applyPresetById(id, preset.id, 'plugin-test')).toBe(true)
    expect(api.node.get(id)!.borderColor).toBe('#abcdef')

    api.project.undo()
    expect(api.node.get(id)!.borderColor).not.toBe('#abcdef')

    // presetId 不存在返回 false，不写历史
    expect(api.node.applyPresetById(id, 'no-such-preset')).toBe(false)
    // 节点不存在也返回 false
    expect(api.node.applyPresetById('no-such-node', preset.id)).toBe(false)
  })

  it('resetStyle: 恢复默认边框色；与前置 setStyle 经 style-<id> 合并为单条历史', () => {
    const api = makeApi()
    const id = api.node.create(ROOT_NODE_ID, 0, 0, 'r')
    const original = api.node.get(id)!.borderColor
    // 两次样式改动用同一 coalesceKey（同 id 集合），1s 内合并为单条历史
    api.node.setStyle([id], { borderColor: '#00ff00' })
    api.node.resetStyle([id])
    expect(api.node.get(id)!.borderColor).toBe(DEFAULT_NODE_STYLE.borderColor)
    // undo 回退整段合并历史 → 回到改动前的原始色
    api.project.undo()
    expect(api.node.get(id)!.borderColor).toBe(original)
  })

  it('defaultSize: 返回主应用节点默认尺寸的普通对象快照', () => {
    const api = makeApi()
    const size = api.node.defaultSize()
    expect(size).toEqual({ width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT })
    // 只读快照：新构造的普通对象，非 store 内部 reactive 引用
    expect(isReactive(size)).toBe(false)
  })

  it('reference 查询：getReferenceNodeId / referenceableNodes / referenceOf / isReferenceNameTaken', () => {
    const api = makeApi()
    const id = api.node.create(ROOT_NODE_ID, 0, 0, '#甲')
    expect(api.node.getReferenceNodeId('甲')).toBe(id)
    expect(api.node.getReferenceNodeId('不存在')).toBeNull()
    expect(api.node.referenceableNodes()).toContainEqual({ name: '甲', nodeId: id })
    expect(api.node.referenceOf(id)).toBe('甲')
    expect(api.node.referenceOf('nope')).toBeNull()
    expect(api.node.isReferenceNameTaken('甲')).toBe(true)
    expect(api.node.isReferenceNameTaken('乙')).toBe(false)
  })

  it('isChildOf / nodesWithTag / stripTagFromAllNodes', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'a')
    const a1 = api.node.create(a, 0, 0, 'a1')
    expect(api.node.isChildOf(a1, a)).toBe(true)
    expect(api.node.isChildOf(a, a)).toBe(false)

    api.node.setTags([a1], ['t1'])
    expect(api.node.nodesWithTag('t1')).toContain(a1)
    // stripTagFromAllNodes（删除标签联带清理）为直接 store 写，不可撤销
    api.node.stripTagFromAllNodes('t1')
    expect(api.node.nodesWithTag('t1')).toEqual([])
    expect(api.node.get(a1)!.tagIds).toEqual([])
  })
})