import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCanvasEvents } from '@/composables/useCanvasEvents'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useProjectStore } from '@/stores/project'
import type { KonvaEventObject } from 'konva/lib/Node'

describe('useCanvasEvents', () => {
  /** 可控时间源，用于驱动双击时间窗判定 */
  let now: number
  let nodeStore: ReturnType<typeof useNodeStore>
  let project: ReturnType<typeof useProjectStore>
  let childCount: () => number

  beforeEach(() => {
    setActivePinia(createPinia())
    now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    nodeStore = useNodeStore()
    project = useProjectStore()
    childCount = () => nodeStore.childrenOf(project.currentNodeId).length
  })

  /** 构造一个「点击空白」的 v-stage 事件（target === currentTarget，指向可取坐标的 stage） */
  function mkEmptyEvent(world: { x: number; y: number }, screen: { x: number; y: number }) {
    const stage = {
      getRelativePointerPosition: () => world,
      getPointerPosition: () => screen,
    }
    const target = { getStage: () => stage } as unknown as EventTarget
    return { target, currentTarget: target } as unknown as KonvaEventObject<MouseEvent>
  }

  /** 构造一个「点击节点/形状」的 v-stage 事件（target !== currentTarget） */
  function mkNodeEvent() {
    const nodeTarget = {} as unknown as EventTarget
    const stageTarget = {} as unknown as EventTarget
    return { target: nodeTarget, currentTarget: stageTarget } as unknown as KonvaEventObject<MouseEvent>
  }

  it('should deselect on canvas click when no node is hit', () => {
    const view = useViewStore('main')

    // 在当前视图（根节点）下创建一个节点并选中
    const id = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(id)
    expect(view.selectedNodeId).not.toBeNull()

    const { handleStageClick } = useCanvasEvents('main')
    handleStageClick(mkEmptyEvent({ x: 300, y: 200 }, { x: 100, y: 80 }))
    expect(view.selectedNodeId).toBeNull()
  })

  it('should create a node on double click centered at the clicked position', () => {
    const { handleStageClick } = useCanvasEvents('main')

    // Mock a Konva Stage
    // getRelativePointerPosition 返回世界坐标（已考虑 Stage 的 scale/offset）
    const event = mkEmptyEvent({ x: 300, y: 200 }, { x: 100, y: 80 })

    now = 0
    handleStageClick(event)
    now = 100 // 100ms 内、位置相同 → 空白双击
    handleStageClick(event)

    const children = nodeStore.childrenOf(project.currentNodeId)
    expect(children.length).toBe(1)
    const node = children[0]
    // 节点左上角应偏移半个节点尺寸，使节点中心对齐鼠标位置
    // DEFAULT_NODE_WIDTH=200 -> 300-100=200, DEFAULT_NODE_HEIGHT=100 -> 200-50=150
    expect(node.x).toBe(200)
    expect(node.y).toBe(150)
  })

  it('should NOT create a node when the first click hits a node and the second hits empty', () => {
    const { handleStageClick } = useCanvasEvents('main')

    now = 0
    handleStageClick(mkNodeEvent()) // 第一次点在节点上 → 重置暂存
    now = 100
    handleStageClick(mkEmptyEvent({ x: 300, y: 200 }, { x: 100, y: 80 })) // 第二次落在空白

    expect(childCount()).toBe(0)
  })

  it('should NOT create a node when the two empty clicks are far apart', () => {
    const { handleStageClick } = useCanvasEvents('main')

    now = 0
    handleStageClick(mkEmptyEvent({ x: 300, y: 200 }, { x: 100, y: 80 }))
    now = 100
    // 屏幕距离远超阈值（100,80）→（500,80）距离 400 → 不构成双击
    handleStageClick(mkEmptyEvent({ x: 300, y: 200 }, { x: 500, y: 80 }))

    expect(childCount()).toBe(0)
  })

  it('should NOT create a node when the two empty clicks exceed the double-click window', () => {
    const { handleStageClick } = useCanvasEvents('main')

    now = 0
    handleStageClick(mkEmptyEvent({ x: 300, y: 200 }, { x: 100, y: 80 }))
    now = 600 // 超过 400ms 窗口
    handleStageClick(mkEmptyEvent({ x: 300, y: 200 }, { x: 100, y: 80 }))

    expect(childCount()).toBe(0)
  })

  it('should create exactly one node on a triple click of empty canvas', () => {
    const { handleStageClick } = useCanvasEvents('main')

    now = 0
    handleStageClick(mkEmptyEvent({ x: 300, y: 200 }, { x: 100, y: 80 }))
    now = 100
    handleStageClick(mkEmptyEvent({ x: 300, y: 200 }, { x: 100, y: 80 })) // 第二次构成双击 → 建节点，暂存清空
    now = 200
    handleStageClick(mkEmptyEvent({ x: 300, y: 200 }, { x: 100, y: 80 })) // 第三次仅为单击

    expect(childCount()).toBe(1)
  })
})