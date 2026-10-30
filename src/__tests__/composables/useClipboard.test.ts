import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useClipboard } from '@/composables/useClipboard'
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'

describe('useClipboard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('copy with no selection returns false', () => {
    const clipboard = useClipboard()
    expect(clipboard.copy([])).toBe(false)
    expect(clipboard.canPaste.value).toBe(false)
  })

  it('copy + paste clones nodes with new ids and preserves text/style', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const clipboard = useClipboard()

    const parentId = project.currentNodeId
    const aId = nodeStore.addNode(parentId, 100, 100, 'A')
    const bId = nodeStore.addNode(parentId, 300, 100, 'B')

    expect(clipboard.copy([aId, bId])).toBe(true)
    expect(clipboard.canPaste.value).toBe(true)

    const newIds = clipboard.paste(parentId)
    // 顶层两个节点全部新建
    expect(newIds).toHaveLength(2)
    expect(newIds).not.toContain(aId)
    expect(newIds).not.toContain(bId)

    const newA = nodeStore.getNode(newIds[0])!
    const newB = nodeStore.getNode(newIds[1])!
    // 保留文本与样式
    expect([newA.text, newB.text].sort()).toEqual(['A', 'B'])
    expect(newA.parentId).toBe(parentId)
    expect(newB.parentId).toBe(parentId)
    // 原有节点不受影响
    expect(nodeStore.getNode(aId)?.text).toBe('A')
  })

  it('copy + paste preserves tagIds', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const clipboard = useClipboard()

    const parentId = project.currentNodeId
    const aId = nodeStore.addNode(parentId, 100, 100, 'A')
    nodeStore.getNode(aId)!.tagIds = ['tag-1', 'tag-2']

    clipboard.copy([aId])
    const newIds = clipboard.paste(parentId)
    expect(nodeStore.getNode(newIds[0])!.tagIds).toEqual(['tag-1', 'tag-2'])
    // 原节点标签不受影响
    expect(nodeStore.getNode(aId)!.tagIds).toEqual(['tag-1', 'tag-2'])
  })

  it('copy + paste clones internal connections (sibling nodes)', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const clipboard = useClipboard()

    const parentId = project.currentNodeId
    const aId = nodeStore.addNode(parentId, 100, 100, 'A')
    const bId = nodeStore.addNode(parentId, 300, 100, 'B')
    nodeStore.addConnection(parentId, aId, bId)

    clipboard.copy([aId, bId])
    const newIds = clipboard.paste(parentId)

    const conns = nodeStore.getConnections(parentId)
    // 原连线 + 新连线
    expect(conns).toHaveLength(2)
    const newConns = conns.filter(
      (c) => c.fromNodeId !== aId && c.toNodeId !== bId,
    )
    expect(newConns).toHaveLength(1)
    // 新连线连到新节点
    expect(newConns[0].fromNodeId).toBe(newIds[0])
    expect(newConns[0].toNodeId).toBe(newIds[1])
  })

  it('copy + paste clones subtree (children) and parentId remap', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const clipboard = useClipboard()

    const parentId = project.currentNodeId
    const containerId = nodeStore.addNode(parentId, 100, 100, '容器')
    const childId = nodeStore.addNode(containerId, 0, 0, '子节点')

    clipboard.copy([containerId])
    const newIds = clipboard.paste(parentId)
    expect(newIds).toHaveLength(1)

    const newContainer = nodeStore.getNode(newIds[0])!
    expect(newContainer.id).not.toBe(containerId)
    // 子节点被一起复制，且 parentId 指向新容器
    const newChildren = nodeStore.childrenOf(newContainer.id)
    expect(newChildren).toHaveLength(1)
    expect(newChildren[0].id).not.toBe(childId)
    expect(newChildren[0].text).toBe('子节点')
  })

  it('cut copies to clipboard, removes originals, and is undoable', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const history = useHistoryStore()
    const clipboard = useClipboard()

    const parentId = project.currentNodeId
    const aId = nodeStore.addNode(parentId, 100, 100, 'A')
    const bId = nodeStore.addNode(parentId, 300, 100, 'B')

    expect(clipboard.cut([aId, bId])).toBe(true)
    // 原节点被删除
    expect(nodeStore.getNode(aId)).toBeUndefined()
    expect(nodeStore.getNode(bId)).toBeUndefined()
    // 剪贴板仍可粘贴
    expect(clipboard.canPaste.value).toBe(true)
    // 剪切操作入历史栈，可撤销
    expect(history.canUndo).toBe(true)
    history.undo()
    expect(nodeStore.getNode(aId)?.text).toBe('A')
    expect(nodeStore.getNode(bId)?.text).toBe('B')
  })

  it('paste is undoable / redoable', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const history = useHistoryStore()
    const clipboard = useClipboard()

    const parentId = project.currentNodeId
    const aId = nodeStore.addNode(parentId, 100, 100, 'A')
    const bId = nodeStore.addNode(parentId, 300, 100, 'B')
    nodeStore.addConnection(parentId, aId, bId)

    clipboard.copy([aId, bId])
    const baseCount = nodeStore.childrenOf(parentId).length
    const newIds = clipboard.paste(parentId)
    const afterPaste = nodeStore.childrenOf(parentId).length
    expect(afterPaste).toBe(baseCount + 2)
    expect(nodeStore.getConnections(parentId)).toHaveLength(2)

    // 撤销粘贴：移除新建节点与连线
    history.undo()
    expect(nodeStore.childrenOf(parentId).length).toBe(baseCount)
    expect(nodeStore.getConnections(parentId)).toHaveLength(1)
    for (const id of newIds) {
      expect(nodeStore.getNode(id)).toBeUndefined()
    }

    // 重做粘贴：恢复
    history.redo()
    expect(nodeStore.childrenOf(parentId).length).toBe(afterPaste)
    expect(nodeStore.getConnections(parentId)).toHaveLength(2)
  })
})