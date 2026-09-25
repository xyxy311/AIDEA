import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createPluginAdapter } from '@/plugin/adapter'
import { ROOT_NODE_ID } from '@/stores/node'

/** 插件 connection 域 api 测试：写方法（增删改/样式/预设）可撤销，只读查询深拷贝隔离。 */
function makeApi() {
  return createPluginAdapter().api
}

describe('plugin connection 域 api', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('add 创建连线，find/list 可查询，undo/redo 生效', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    const b = api.node.create(ROOT_NODE_ID, 0, 0, 'B')
    const id = api.connection.add(ROOT_NODE_ID, a, b)
    expect(id).toBeTruthy()

    expect(api.connection.list(ROOT_NODE_ID).map((c) => c.id)).toContain(id)
    const found = api.connection.find(id!)
    expect(found).not.toBeNull()
    expect(found!.parentId).toBe(ROOT_NODE_ID)
    expect(found!.connection.fromNodeId).toBe(a)
    expect(found!.connection.toNodeId).toBe(b)

    api.project.undo()
    expect(api.connection.list(ROOT_NODE_ID).length).toBe(0)
    expect(api.connection.find(id!)).toBeNull()
    api.project.redo()
    expect(api.connection.list(ROOT_NODE_ID).map((c) => c.id)).toContain(id)
  })

  it('update 更新字段且可撤销；查询返回深拷贝对象（防篡改隔离）', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    const b = api.node.create(ROOT_NODE_ID, 0, 0, 'B')
    const id = api.connection.add(ROOT_NODE_ID, a, b)!

    api.connection.update(ROOT_NODE_ID, id, { text: '连线', strokeWidth: 3, directed: true })
    let conn = api.connection.find(id)!
    expect(conn.connection.text).toBe('连线')
    expect(conn.connection.strokeWidth).toBe(3)
    expect(conn.connection.directed).toBe(true)

    // 篡改查询返回对象不影响内部 store（深拷贝隔离）
    conn.connection.text = '被篡改'
    expect(api.connection.find(id)!.connection.text).toBe('连线')

    api.project.undo()
    const afterUndo = api.connection.find(id)!
    expect(afterUndo.connection.text).toBeNull()
    expect(afterUndo.connection.strokeWidth).not.toBe(3)
  })

  it('delete(connectionId) 按单一 ID 删除且可撤销', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    const b = api.node.create(ROOT_NODE_ID, 0, 0, 'B')
    const c = api.node.create(ROOT_NODE_ID, 0, 0, 'C')
    const id1 = api.connection.add(ROOT_NODE_ID, a, b)!
    api.connection.add(ROOT_NODE_ID, b, c)

    api.connection.delete(id1)
    expect(api.connection.find(id1)).toBeNull()
    expect(api.connection.list(ROOT_NODE_ID).length).toBe(1)

    api.project.undo()
    expect(api.connection.find(id1)).not.toBeNull()
    expect(api.connection.list(ROOT_NODE_ID).length).toBe(2)
  })

  it('remove 按父级删除、removeByIds 跨父级删除且可撤销', () => {
    const api = makeApi()
    // 父容器 A、B 各自有连线
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    const b = api.node.create(ROOT_NODE_ID, 0, 0, 'B')
    const a1 = api.node.create(a, 0, 0, 'a1')
    const a2 = api.node.create(a, 0, 0, 'a2')
    const b1 = api.node.create(b, 0, 0, 'b1')
    const b2 = api.node.create(b, 0, 0, 'b2')
    const ca = api.connection.add(a, a1, a2)!
    const cb = api.connection.add(b, b1, b2)!

    // remove 按父级删除
    api.connection.remove(a, [ca])
    expect(api.connection.list(a).length).toBe(0)
    expect(api.connection.list(b).length).toBe(1)

    api.project.undo()
    expect(api.connection.list(a).length).toBe(1)

    // removeByIds 跨父级批量删除
    api.connection.removeByIds([ca, cb])
    expect(api.connection.list(a).length).toBe(0)
    expect(api.connection.list(b).length).toBe(0)

    api.project.undo()
    expect(api.connection.list(a).length).toBe(1)
    expect(api.connection.list(b).length).toBe(1)
  })

  it('move 迁移连线到目标父级且可撤销', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    const b = api.node.create(ROOT_NODE_ID, 0, 0, 'B')
    const c = api.node.create(ROOT_NODE_ID, 0, 0, 'C')
    const ab = api.connection.add(ROOT_NODE_ID, a, b)!

    api.connection.move(ROOT_NODE_ID, c, [ab])
    expect(api.connection.list(ROOT_NODE_ID).length).toBe(0)
    expect(api.connection.list(c).map((cc) => cc.id)).toContain(ab)

    api.project.undo()
    expect(api.connection.list(ROOT_NODE_ID).map((cc) => cc.id)).toContain(ab)
    expect(api.connection.list(c).length).toBe(0)
  })

  it('updateStyle 批量更新且可撤销', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    const b = api.node.create(ROOT_NODE_ID, 0, 0, 'B')
    const c = api.node.create(ROOT_NODE_ID, 0, 0, 'C')
    const id1 = api.connection.add(ROOT_NODE_ID, a, b)!
    const id2 = api.connection.add(ROOT_NODE_ID, b, c)!

    api.connection.updateStyle(ROOT_NODE_ID, [id1, id2], { strokeColor: '#00ff00', lineStyle: 'dashed' })
    for (const cid of [id1, id2]) {
      expect(api.connection.find(cid)!.connection.strokeColor).toBe('#00ff00')
      expect(api.connection.find(cid)!.connection.lineStyle).toBe('dashed')
    }

    api.project.undo()
    expect(api.connection.find(id1)!.connection.strokeColor).not.toBe('#00ff00')
  })

  it('updateStyleByIds 按 ID 批量更新且可撤销', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    const b = api.node.create(ROOT_NODE_ID, 0, 0, 'B')
    const id1 = api.connection.add(ROOT_NODE_ID, a, b)!

    api.connection.updateStyleByIds([id1], { strokeColor: '#123456', text: '标注' })
    let conn = api.connection.find(id1)!
    expect(conn.connection.strokeColor).toBe('#123456')
    expect(conn.connection.text).toBe('标注')

    api.project.undo()
    conn = api.connection.find(id1)!
    expect(conn.connection.strokeColor).not.toBe('#123456')
    expect(conn.connection.text).toBeNull()
  })

  it('applyPreset: 应用标准连线预设；applyText 为真时写入预设名且可撤销', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    const b = api.node.create(ROOT_NODE_ID, 0, 0, 'B')
    const id = api.connection.add(ROOT_NODE_ID, a, b)!

    api.connection.applyPreset(ROOT_NODE_ID, id, {
      lineStyle: 'dotted',
      strokeWidth: 5,
      strokeColor: '#ff0000',
      directed: true,
      name: '箭头',
      applyText: true,
    })
    let conn = api.connection.find(id)!
    expect(conn.connection.lineStyle).toBe('dotted')
    expect(conn.connection.strokeWidth).toBe(5)
    expect(conn.connection.strokeColor).toBe('#ff0000')
    expect(conn.connection.directed).toBe(true)
    expect(conn.connection.text).toBe('箭头')

    api.project.undo()
    conn = api.connection.find(id)!
    expect(conn.connection.text).toBeNull()
    expect(conn.connection.lineStyle).not.toBe('dotted')

    // applyText 为假时不改写连线文字
    api.connection.applyPreset(ROOT_NODE_ID, id, {
      lineStyle: 'solid',
      strokeWidth: 2,
      strokeColor: '#000000',
      directed: false,
      name: '无文字',
      applyText: false,
    })
    conn = api.connection.find(id)!
    expect(conn.connection.text).toBeNull()
    expect(conn.connection.lineStyle).toBe('solid')
  })

  it('applyPresetById: 自建连线预设应用可撤销；预设或连线不存在返回 false', () => {
    const api = makeApi()
    const a = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    const b = api.node.create(ROOT_NODE_ID, 0, 0, 'B')
    const id = api.connection.add(ROOT_NODE_ID, a, b)!

    // 自建连线预设（applyText 为真，应用时写入预设名）
    const preset = api.presets.addConnectionPreset({
      name: '测试连线预设',
      lineStyle: 'dotted',
      strokeWidth: 4,
      strokeColor: '#123456',
      directed: true,
      applyText: true,
      groupId: null,
    })

    expect(api.connection.applyPresetById(id, preset.id, 'plugin-test')).toBe(true)
    let conn = api.connection.find(id)!
    expect(conn.connection.lineStyle).toBe('dotted')
    expect(conn.connection.strokeWidth).toBe(4)
    expect(conn.connection.strokeColor).toBe('#123456')
    expect(conn.connection.directed).toBe(true)
    expect(conn.connection.text).toBe('测试连线预设')

    api.project.undo()
    conn = api.connection.find(id)!
    expect(conn.connection.text).toBeNull()
    expect(conn.connection.lineStyle).not.toBe('dotted')

    // presetId 不存在返回 false
    expect(api.connection.applyPresetById(id, 'no-such-preset')).toBe(false)
    // 连线不存在返回 false
    expect(api.connection.applyPresetById('no-such-conn', preset.id)).toBe(false)
  })
})