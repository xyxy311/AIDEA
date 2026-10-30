import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCommands } from '@/composables/useCommands'
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'

describe('useCommands.insertNodeIntoConnection', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function setup() {
    const commands = useCommands()
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const parentId = project.currentNodeId
    const a = commands.createNode(parentId, 0, 0)
    const b = commands.createNode(parentId, 400, 0)
    const c = commands.createNode(parentId, 200, 300)
    const connId = commands.addConnection(parentId, a, b)
    return { commands, nodeStore, history: useHistoryStore(), parentId, a, b, c, connId: connId! }
  }

  it('插入后原连线改为 A->C，新增 C->B 并继承样式', () => {
    const { commands, nodeStore, parentId, a, b, c, connId } = setup()
    const before = nodeStore.getConnections(parentId)[0]
    before.lineStyle = 'dashed'
    before.strokeWidth = 4
    before.strokeColor = '#123456'
    before.directed = true
    before.text = '标注'
    // 模拟拖拽：数据已在 mousemove 中改写 store，命令层仅入栈
    nodeStore.moveNode(c, 200, 0)

    commands.insertNodeIntoConnection(parentId, connId, c, [
      { id: c, oldX: 200, oldY: 300, newX: 200, newY: 0 },
    ])

    const conns = nodeStore.getConnections(parentId)
    expect(conns).toHaveLength(2)
    expect(conns[0].id).toBe(connId)
    expect(conns[0].fromNodeId).toBe(a)
    expect(conns[0].toNodeId).toBe(c)
    expect(conns[0].text).toBe('标注')
    expect(conns[1].fromNodeId).toBe(c)
    expect(conns[1].toNodeId).toBe(b)
    expect(conns[1].lineStyle).toBe('dashed')
    expect(conns[1].strokeWidth).toBe(4)
    expect(conns[1].strokeColor).toBe('#123456')
    expect(conns[1].directed).toBe(true)
    expect(conns[1].text).toBeNull()
    // 节点位置随历史提交
    expect(nodeStore.getNode(c)!.y).toBe(0)
  })

  it('undo 一步还原为 A->B（含节点位置）', () => {
    const { commands, nodeStore, history, parentId, a, b, c, connId } = setup()
    commands.insertNodeIntoConnection(parentId, connId, c, [
      { id: c, oldX: 200, oldY: 300, newX: 200, newY: 0 },
    ])
    history.undo()
    const conns = nodeStore.getConnections(parentId)
    expect(conns).toHaveLength(1)
    expect(conns[0].id).toBe(connId)
    expect(conns[0].fromNodeId).toBe(a)
    expect(conns[0].toNodeId).toBe(b)
    expect(nodeStore.getNode(c)!.y).toBe(300)
  })

  it('redo 恢复插入结果', () => {
    const { commands, nodeStore, history, parentId, c, connId } = setup()
    commands.insertNodeIntoConnection(parentId, connId, c, [])
    history.undo()
    history.redo()
    const conns = nodeStore.getConnections(parentId)
    expect(conns).toHaveLength(2)
    expect(conns[0].toNodeId).toBe(c)
    expect(conns[1].fromNodeId).toBe(c)
  })

  it('nodeId 是连线端点时不做任何修改', () => {
    const { commands, nodeStore, parentId, a, connId } = setup()
    commands.insertNodeIntoConnection(parentId, connId, a, [])
    expect(nodeStore.getConnections(parentId)).toHaveLength(1)
  })
})
