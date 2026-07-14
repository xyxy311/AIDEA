import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCanvasEvents } from '@/composables/useCanvasEvents'
import { useWhiteboardStore } from '@/stores/whiteboard'
import type { KonvaEventObject } from 'konva/lib/Node'

describe('useCanvasEvents', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should deselect on canvas click when no node is hit', () => {
    const store = useWhiteboardStore()
    store.addNode(0, 0)
    expect(store.selectedNodeId).not.toBeNull()

    const { handleStageClick } = useCanvasEvents()

    // When clicking empty canvas (target === currentTarget means no shape hit)
    // Must use the SAME object reference so === returns true
    const sameRef = {} as unknown as EventTarget
    const mockEvent = {
      target: sameRef,
      currentTarget: sameRef,
    } as unknown as KonvaEventObject<MouseEvent>

    handleStageClick(mockEvent)
    expect(store.selectedNodeId).toBeNull()
  })

  it('should create a node on double click centered at the clicked position', () => {
    const store = useWhiteboardStore()
    const { handleStageDblClick } = useCanvasEvents()

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
    expect(store.nodesArray.length).toBe(1)
    const node = store.nodesArray[0]
    // 节点左上角应偏移半个节点尺寸，使节点中心对齐鼠标位置
    // DEFAULT_NODE_WIDTH=200 → 300-100=200, DEFAULT_NODE_HEIGHT=120 → 200-60=140
    expect(node.x).toBe(200)
    expect(node.y).toBe(140)
  })
})
