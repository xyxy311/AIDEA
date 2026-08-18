import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCanvasEvents } from '@/composables/useCanvasEvents'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useProjectStore } from '@/stores/project'
import { t } from '@/composables/useT'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { AIDivergenceDirection } from '@/types/ai'

// 用 vi.hoisted 在模块顶层声明可复用的 mock，供 vi.mock 与测试内部共享
const mocks = vi.hoisted(() => {
  const directions: AIDivergenceDirection[] = [
    { id: 'd1', title: '为什么？', prompt: '围绕原因发散' },
    { id: 'd2', title: '怎么做？', prompt: '围绕方法发散' },
  ]
  return {
    directions,
    generateDirectional: vi.fn(),
  }
})

vi.mock('@/composables/useAIWordPanel', () => ({
  useAIWordPanel: () => ({ generateDirectional: mocks.generateDirectional }),
}))

vi.mock('@/stores/aiDirections', () => ({
  useAIDirectionsStore: () => ({
    directionList: mocks.directions,
  }),
}))

/** 构造右键菜单事件（提供 preventDefault 与 clientX/clientY） */
function mockContextMenuEvent(): KonvaEventObject<MouseEvent> {
  return {
    evt: { preventDefault: vi.fn(), clientX: 100, clientY: 100 },
  } as unknown as KonvaEventObject<MouseEvent>
}

describe('useCanvasEvents 发散子菜单', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.generateDirectional.mockReset()
  })

  it('有选中节点时右键菜单含「发散」父项，children 由 directionList 全量映射', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const id = nodeStore.addNode(project.currentNodeId, 0, 0, '起点')
    view.selectNode(id)

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(mockContextMenuEvent())

    const items = contextMenu.items.value
    const divergence = items.find((it) => it.key === 'divergence')
    expect(divergence).toBeDefined()
    expect(divergence!.label).toBe(t('canvas.divergence'))
    expect(divergence!.children).toBeDefined()

    const children = divergence!.children!
    // 子项为 directionList 全量映射（含任意/聚焦/具体角度），无独立「直接发散」子项
    expect(children.length).toBe(mocks.directions.length)
    mocks.directions.forEach((d, i) => {
      expect(children[i].label).toBe(d.title)
    })
  })

  it('点击方向子项触发 generateDirectional(from, 该方向)', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const id = nodeStore.addNode(project.currentNodeId, 0, 0, '起点')
    view.selectNode(id)

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(mockContextMenuEvent())

    const divergence = contextMenu.items.value.find((it) => it.key === 'divergence')!
    const children = divergence.children!
    // 点击第一个方向子项对应 mocks.directions[0]
    children[0].action!()

    expect(mocks.generateDirectional).toHaveBeenCalledTimes(1)
    expect(mocks.generateDirectional).toHaveBeenCalledWith(['起点'], mocks.directions[0])
  })
})