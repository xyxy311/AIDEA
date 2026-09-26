import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCanvasEvents } from '@/composables/useCanvasEvents'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useProjectStore } from '@/stores/project'
import type { KonvaEventObject } from 'konva/lib/Node'

function mockContextMenuEvent(): KonvaEventObject<MouseEvent> {
  return {
    evt: { preventDefault: vi.fn(), clientX: 100, clientY: 100 },
  } as unknown as KonvaEventObject<MouseEvent>
}

describe('useCanvasEvents 右键菜单删除项', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('有选中节点 → 菜单含 delete 项，执行删除选中节点并清空选中', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const id1 = nodeStore.addNode(project.currentNodeId, 0, 0, '甲')
    const id2 = nodeStore.addNode(project.currentNodeId, 50, 0, '乙')
    view.setSelectedNodes([id1, id2])

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(mockContextMenuEvent())

    const del = contextMenu.items.value.find((it) => it.key === 'delete')
    expect(del).toBeDefined()
    expect(del!.danger).toBe(true)

    del!.action!()
    expect(nodeStore.getNode(id1)).toBeUndefined()
    expect(nodeStore.getNode(id2)).toBeUndefined()
    expect(view.selectedNodeIds.size).toBe(0)
  })

  it('有选中连线 → 菜单含 delete 项，执行删除选中连线并清空选中', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const a = nodeStore.addNode(project.currentNodeId, 0, 0, '甲')
    const b = nodeStore.addNode(project.currentNodeId, 100, 0, '乙')
    const connId = nodeStore.addConnection(project.currentNodeId, a, b)!
    view.selectConnection(connId)

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(mockContextMenuEvent())

    const del = contextMenu.items.value.find((it) => it.key === 'delete')
    expect(del).toBeDefined()
    expect(contextMenu.visible.value).toBe(true)

    del!.action!()
    expect(nodeStore.getConnections(project.currentNodeId).length).toBe(0)
    expect(view.selectedConnectionIds.size).toBe(0)
  })

  it('无任何选中 → 无 delete 项', () => {
    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(mockContextMenuEvent())
    expect(contextMenu.items.value.find((it) => it.key === 'delete')).toBeUndefined()
  })
})