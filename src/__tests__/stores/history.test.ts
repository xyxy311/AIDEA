import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'
import { useCommands } from '@/composables/useCommands'

describe('history store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('基本 undo/redo', () => {
    it('创建节点后 undo 应删除节点，redo 应恢复', () => {
      const nodeStore = useNodeStore()
      const history = useHistoryStore()
      const commands = useCommands()

      const id = commands.createNode(ROOT_NODE_ID, 100, 100, '测试')
      expect(nodeStore.getNode(id)).toBeTruthy()
      expect(history.canUndo).toBe(true)

      history.undo()
      expect(nodeStore.getNode(id)).toBeUndefined()
      expect(history.canRedo).toBe(true)

      history.redo()
      expect(nodeStore.getNode(id)).toBeTruthy()
      expect(nodeStore.getNode(id)?.text).toBe('测试')
    })

    it('移动节点后 undo 应恢复旧位置', () => {
      const nodeStore = useNodeStore()
      const history = useHistoryStore()
      const commands = useCommands()

      const id = commands.createNode(ROOT_NODE_ID, 100, 100, '节点')
      commands.clearHistory() // 清除创建命令，保留节点数据

      nodeStore.moveNode(id, 200, 200)
      commands.commitNodeMove([{ id, oldX: 100, oldY: 100, newX: 200, newY: 200 }])

      history.undo()
      expect(nodeStore.getNode(id)?.x).toBe(100)
      expect(nodeStore.getNode(id)?.y).toBe(100)

      history.redo()
      expect(nodeStore.getNode(id)?.x).toBe(200)
      expect(nodeStore.getNode(id)?.y).toBe(200)
    })

    it('编辑文本后 undo 应恢复旧文本和尺寸', () => {
      const nodeStore = useNodeStore()
      const history = useHistoryStore()
      const commands = useCommands()

      const id = commands.createNode(ROOT_NODE_ID, 0, 0, '短')
      const oldWidth = nodeStore.getNode(id)!.width
      commands.clearHistory() // 清除创建命令，保留节点数据

      commands.setNodeText(id, '这是一段很长的文本内容用于测试尺寸变化')
      expect(nodeStore.getNode(id)?.text).not.toBe('短')

      history.undo()
      expect(nodeStore.getNode(id)?.text).toBe('短')
      expect(nodeStore.getNode(id)?.width).toBe(oldWidth)
    })
  })

  describe('删除与恢复', () => {
    it('删除节点后 undo 应恢复节点和连线', () => {
      const nodeStore = useNodeStore()
      const history = useHistoryStore()
      const commands = useCommands()

      const a = commands.createNode(ROOT_NODE_ID, 0, 0, 'A')
      const b = commands.createNode(ROOT_NODE_ID, 100, 0, 'B')
      commands.addConnection(ROOT_NODE_ID, a, b)

      // 清除历史，保留当前数据状态
      while (history.canUndo) history.undo()
      commands.clearHistory()
      // 重新创建到有 A、B 和连线的状态
      const a2 = commands.createNode(ROOT_NODE_ID, 0, 0, 'A')
      const b2 = commands.createNode(ROOT_NODE_ID, 100, 0, 'B')
      commands.addConnection(ROOT_NODE_ID, a2, b2)

      commands.deleteNodes([a2])
      expect(nodeStore.getNode(a2)).toBeUndefined()
      expect(nodeStore.getConnections(ROOT_NODE_ID).length).toBe(0)

      history.undo()
      expect(nodeStore.getNode(a2)).toBeTruthy()
      expect(nodeStore.getConnections(ROOT_NODE_ID).length).toBe(1)
    })

    it('删除子树后 undo 应恢复整个子树', () => {
      const nodeStore = useNodeStore()
      const history = useHistoryStore()
      const commands = useCommands()

      const parent = commands.createNode(ROOT_NODE_ID, 0, 0, '父')
      const child = commands.createNode(parent, 50, 50, '子')
      const grandchild = commands.createNode(child, 60, 60, '孙')

      commands.deleteNodes([parent])
      expect(nodeStore.getNode(parent)).toBeUndefined()
      expect(nodeStore.getNode(child)).toBeUndefined()
      expect(nodeStore.getNode(grandchild)).toBeUndefined()

      history.undo()
      expect(nodeStore.getNode(parent)).toBeTruthy()
      expect(nodeStore.getNode(child)).toBeTruthy()
      expect(nodeStore.getNode(grandchild)).toBeTruthy()
    })
  })

  describe('视图协调', () => {
    it('addSubNode 后 undo 应回退到父级视图', () => {
      const nodeStore = useNodeStore()
      const project = useProjectStore()
      const history = useHistoryStore()
      const commands = useCommands()

      // 在 root 视图创建子节点并进入其视图
      const childId = commands.createNode(ROOT_NODE_ID, 0, 0, '子')
      project.switchView(childId)

      expect(project.activeViewId).toBe(childId)

      // undo 创建 -> 子节点被删 -> 应回退到 root
      history.undo()
      expect(project.activeViewId).toBe(ROOT_NODE_ID)
      expect(nodeStore.getNode(childId)).toBeUndefined()
    })

    it('undo 不影响无关视图（当前视图节点仍存在时保持）', () => {
      const nodeStore = useNodeStore()
      const project = useProjectStore()
      const history = useHistoryStore()
      const commands = useCommands()

      const a = commands.createNode(ROOT_NODE_ID, 0, 0, 'A')
      const b = commands.createNode(ROOT_NODE_ID, 100, 0, 'B')
      project.switchView(a) // 进入 A 视图（纯视图操作，不入栈）

      // undo 创建 B -> B 被删，但当前视图 A 仍存在 -> 保持 A
      history.undo()
      expect(project.activeViewId).toBe(a)
      expect(nodeStore.getNode(b)).toBeUndefined()
    })
  })

  describe('coalesce 合并', () => {
    it('连续同 key 编辑应合并为一条历史', () => {
      const nodeStore = useNodeStore()
      const history = useHistoryStore()
      const commands = useCommands()

      const id = commands.createNode(ROOT_NODE_ID, 0, 0, '初始')
      while (history.canUndo) history.undo()
      commands.clearHistory()
      // 重新创建
      const id2 = commands.createNode(ROOT_NODE_ID, 0, 0, '初始')

      // 连续编辑（同 coalesceKey，1s 内）
      commands.setNodeText(id2, 'a')
      commands.setNodeText(id2, 'ab')
      commands.setNodeText(id2, 'abc')

      expect(nodeStore.getNode(id2)?.text).toBe('abc')

      // 一次 undo 应回到编辑前
      history.undo()
      expect(nodeStore.getNode(id2)?.text).toBe('初始')
    })
  })

  describe('栈上限', () => {
    it('超过 50 步应丢弃最早', () => {
      const nodeStore = useNodeStore()
      const history = useHistoryStore()
      const commands = useCommands()

      // 创建 51 个节点
      for (let i = 0; i < 51; i++) {
        commands.createNode(ROOT_NODE_ID, i * 10, 0, `节点${i}`)
      }

      // undo 50 次（最早的一条已丢弃，无法回到空状态）
      for (let i = 0; i < 50; i++) {
        history.undo()
      }

      // 还剩 1 个节点（第 0 个的命令已丢弃，无法撤销其创建）
      expect(nodeStore.childrenOf(ROOT_NODE_ID).length).toBe(1)
    })
  })

  describe('batch 事务', () => {
    it('batch 内多个操作应合并为一条历史', () => {
      const nodeStore = useNodeStore()
      const history = useHistoryStore()
      const commands = useCommands()

      commands.beginBatch()
      const a = commands.createNode(ROOT_NODE_ID, 0, 0, 'A')
      const b = commands.createNode(ROOT_NODE_ID, 100, 0, 'B')
      commands.addConnection(ROOT_NODE_ID, a, b)
      commands.commitBatch()

      // 一次 undo 撤销全部
      history.undo()
      expect(nodeStore.childrenOf(ROOT_NODE_ID).length).toBe(0)
    })
  })

  describe('节点样式（undefined 默认值）', () => {
    it('更新样式应生效，undo 应恢复 undefined', () => {
      const nodeStore = useNodeStore()
      const history = useHistoryStore()
      const commands = useCommands()

      const id = commands.createNode(ROOT_NODE_ID, 0, 0, '样式节点')
      // 新建节点的样式字段为 undefined
      expect(nodeStore.getNode(id)?.textColor).toBeUndefined()
      expect(nodeStore.getNode(id)?.backgroundColor).toBeUndefined()

      // 更新样式 — 不应抛错
      commands.updateNodesStyle([id], { textColor: '#ff0000', backgroundColor: '#00ff00' })
      expect(nodeStore.getNode(id)?.textColor).toBe('#ff0000')
      expect(nodeStore.getNode(id)?.backgroundColor).toBe('#00ff00')

      // undo 应恢复为 undefined
      history.undo()
      expect(nodeStore.getNode(id)?.textColor).toBeUndefined()
      expect(nodeStore.getNode(id)?.backgroundColor).toBeUndefined()

      // redo 应恢复样式
      history.redo()
      expect(nodeStore.getNode(id)?.textColor).toBe('#ff0000')
      expect(nodeStore.getNode(id)?.backgroundColor).toBe('#00ff00')
    })
  })
})
