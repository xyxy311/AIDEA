import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCanvasEvents } from '@/composables/useCanvasEvents'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useProjectStore } from '@/stores/project'
import type { KonvaEventObject } from 'konva/lib/Node'

describe('useCanvasEvents', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should deselect on canvas click when no node is hit', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')

    // 在当前视图（根节点）下创建一个节点并选中
    const id = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(id)
    expect(view.selectedNodeId).not.toBeNull()

    const { handleStageClick } = useCanvasEvents('main')

    // When clicking empty canvas (target === currentTarget means no shape hit)
    // Must use the SAME object reference so === returns true
    const sameRef = {} as unknown as EventTarget
    const mockEvent = {
      target: sameRef,
      currentTarget: sameRef,
    } as unknown as KonvaEventObject<MouseEvent>

    handleStageClick(mockEvent)
    expect(view.selectedNodeId).toBeNull()
  })

  it('should create a node on double click centered at the clicked position', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const { handleStageDblClick } = useCanvasEvents('main')

    // Mock a Konva Stage
    // getRelativePointerPosition 返回世界坐标（已考虑 Stage 的 scale/offset）
    const mockStage = {
      getRelativePointerPosition: () => ({ x: 300, y: 200 }),
    }

    // target 和 currentTarget 必须指向同一对象（模拟点击空白区域）
    const sameRef = {
      getStage: () => mockStage,
    } as unknown as EventTarget

    const mockEvent = {
      target: sameRef,
      currentTarget: sameRef,
      evt: new MouseEvent('dblclick'),
    } as unknown as KonvaEventObject<MouseEvent>

    handleStageDblClick(mockEvent)
    const children = nodeStore.childrenOf(project.currentNodeId)
    expect(children.length).toBe(1)
    const node = children[0]
    // 节点左上角应偏移半个节点尺寸，使节点中心对齐鼠标位置
    // DEFAULT_NODE_WIDTH=200 -> 300-100=200, DEFAULT_NODE_HEIGHT=120 -> 200-60=140
    expect(node.x).toBe(200)
    expect(node.y).toBe(140)
  })
})
