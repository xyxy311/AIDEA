import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCanvasEvents } from '@/composables/useCanvasEvents'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useProjectStore } from '@/stores/project'
import type { KonvaEventObject } from 'konva/lib/Node'

/** 命中 Konva 目标链的 mock：names 自深到浅，父链末端指向独立 stage 对象（循环在 target===stage 时停止） */
function mockContextMenuEventWithHit(names: string[]): KonvaEventObject<MouseEvent> {
  const stage: Record<string, unknown> = {}
  const nodes = names.map((name) => ({ name: () => name, getParent: () => null as unknown }))
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i].getParent = () => nodes[i + 1]
  }
  nodes[nodes.length - 1].getParent = () => stage
  Object.assign(nodes[0], { getStage: () => stage })
  return {
    evt: { preventDefault: vi.fn(), clientX: 100, clientY: 100 },
    target: nodes[0],
  } as unknown as KonvaEventObject<MouseEvent>
}

/** 未命中目标的右键事件（target 缺失 / 无 getStage） */
function mockContextMenuEventEmptyTarget(): KonvaEventObject<MouseEvent> {
  return {
    evt: { preventDefault: vi.fn(), clientX: 100, clientY: 100 },
    target: undefined,
  } as unknown as KonvaEventObject<MouseEvent>
}

describe('useCanvasEvents 右键自动选中（无选中态）', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('无选中时右键命中节点 → 自动选中该节点并弹出选中级菜单', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const a = nodeStore.addNode(project.currentNodeId, 0, 0, '甲')
    const b = nodeStore.addNode(project.currentNodeId, 100, 0, '乙')
    view.clearSelection()

    // e.target 为节点背景矩形，父链向上到 group（name=节点ID）
    const evt = mockContextMenuEventWithHit(['', b])

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(evt)

    // 自动选中命中的节点 b（非 a）
    expect(view.selectedNodeIds.has(b)).toBe(true)
    expect(view.selectedNodeIds.has(a)).toBe(false)
    // 打开选中级菜单（含节点固有 delete 项）
    expect(contextMenu.visible.value).toBe(true)
    expect(contextMenu.items.value.find((it) => it.key === 'delete')).toBeDefined()
  })

  it('无选中时右键命中连线 → 自动选中该连线并弹出菜单', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const a = nodeStore.addNode(project.currentNodeId, 0, 0, '甲')
    const b = nodeStore.addNode(project.currentNodeId, 100, 0, '乙')
    const connId = nodeStore.addConnection(project.currentNodeId, a, b)!
    view.clearSelection()

    // e.target 为连线本体（name=连线ID）
    const evt = mockContextMenuEventWithHit([connId])

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(evt)

    expect(view.selectedConnectionIds.has(connId)).toBe(true)
    expect(view.selectedNodeIds.size).toBe(0)
    expect(contextMenu.visible.value).toBe(true)
    expect(contextMenu.items.value.find((it) => it.key === 'delete')).toBeDefined()
  })

  it('无选中时右键命中空白（target 缺失）→ 保持原有画布级行为，不自动选中', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const a = nodeStore.addNode(project.currentNodeId, 0, 0, '甲')
    view.clearSelection()

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(mockContextMenuEventEmptyTarget())

    // 不因右键自动选中任何节点
    expect(view.selectedNodeIds.size).toBe(0)
    // 无选中、无插件/粘贴/删除项 → 原有行为：关闭菜单（不弹空菜单）
    expect(contextMenu.visible.value).toBe(false)
    expect(contextMenu.items.value.find((it) => it.key === 'delete')).toBeUndefined()
    expect(contextMenu.items.value.find((it) => it.key === 'copy')).toBeUndefined()
  })

  it('已有选中节点时右键命中另一节点 → 不自动改选，保持现有选中态', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const a = nodeStore.addNode(project.currentNodeId, 0, 0, '甲')
    const b = nodeStore.addNode(project.currentNodeId, 100, 0, '乙')
    view.selectNode(a)

    const evt = mockContextMenuEventWithHit([
      '',
      b,
    ])

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(evt)

    // 已有选中 → 不自动改选，仍选中 a
    expect(view.selectedNodeIds.has(a)).toBe(true)
    expect(view.selectedNodeIds.has(b)).toBe(false)
    expect(contextMenu.visible.value).toBe(true)
  })
})