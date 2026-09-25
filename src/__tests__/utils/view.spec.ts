import { describe, it, expect, vi } from 'vitest'
import {
  hitTestInlineViewWorld,
  mapMainWorldToInlineWorld,
  hitTestInlineViewScreen,
  screenToMainWorld,
  screenToInlineWorld,
} from '../../utils/view'
import { INLINE_VIEW_TITLE_HEIGHT } from '@/constants'

function mockDOMRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON() {
      return { ...this }
    },
    ...overrides,
  } as DOMRect
}

function mockNode(overrides: Partial<ReturnType<typeof vi.fn>> & { x: number; y: number; width: number; height: number; id: string }) {
  return overrides as any
}

function createMockNodeStore(nodes: Record<string, { x: number; y: number; width: number; height: number }>) {
  return {
    getNode: vi.fn((id: string) => {
      const n = nodes[id]
      return n ? { id, ...n } : undefined
    }),
  } as any
}

function createMockHostView(
  inlineViews: Array<{ nodeId: string; viewId: string; width: number; height: number }>,
  stageX: number = 0,
  stageY: number = 0,
  stageScale: number = 1,
) {
  return {
    inlineViews,
    getInlineViewRect: vi.fn((nodeId: string) => {
      const iv = inlineViews.find((v) => v.nodeId === nodeId)
      return iv ? { width: iv.width, height: iv.height } : null
    }),
    stageX,
    stageY,
    stageScale,
  } as any
}

function createMockInlineView(
  stageX: number = 0,
  stageY: number = 0,
  stageScale: number = 1,
) {
  return {
    stageX,
    stageY,
    stageScale,
  } as any
}

describe('hitTestInlineViewWorld', () => {
  it('应该命中内容区内的世界坐标', () => {
    const nodeStore = createMockNodeStore({
      'node-1': { x: 100, y: 200, width: 300, height: 200 },
    })
    const hostView = createMockHostView([
      { nodeId: 'node-1', viewId: 'iv-1', width: 300, height: 200 },
    ])

    // 内容区 y 范围 = [200 + 28, 200 + 200] = [228, 400]
    // x 范围 = [100, 400]
    const result = hitTestInlineViewWorld(250, 300, hostView, nodeStore)
    expect(result).toBe('node-1')
  })

  it('标题栏区域不算命中', () => {
    const nodeStore = createMockNodeStore({
      'node-1': { x: 100, y: 200, width: 300, height: 200 },
    })
    const hostView = createMockHostView([
      { nodeId: 'node-1', viewId: 'iv-1', width: 300, height: 200 },
    ])

    // y = 200 + 10 在标题栏内（标题栏高 28），不应命中
    const result = hitTestInlineViewWorld(250, 210, hostView, nodeStore)
    expect(result).toBeNull()
  })

  it('内容区外的坐标不命中', () => {
    const nodeStore = createMockNodeStore({
      'node-1': { x: 100, y: 200, width: 300, height: 200 },
    })
    const hostView = createMockHostView([
      { nodeId: 'node-1', viewId: 'iv-1', width: 300, height: 200 },
    ])

    // x 超出右侧
    const result = hitTestInlineViewWorld(500, 300, hostView, nodeStore)
    expect(result).toBeNull()
  })

  it('节点或矩形缺失时跳过该内联视图项', () => {
    const nodeStore = createMockNodeStore({})
    const hostView = createMockHostView([
      { nodeId: 'node-1', viewId: 'iv-1', width: 300, height: 200 },
    ])

    const result = hitTestInlineViewWorld(250, 300, hostView, nodeStore)
    expect(result).toBeNull()
  })

  it('多个内联视图中命中正确的那个', () => {
    const nodeStore = createMockNodeStore({
      'node-a': { x: 0, y: 0, width: 100, height: 100 },
      'node-b': { x: 200, y: 200, width: 100, height: 100 },
    })
    const hostView = createMockHostView([
      { nodeId: 'node-a', viewId: 'iv-a', width: 100, height: 100 },
      { nodeId: 'node-b', viewId: 'iv-b', width: 100, height: 100 },
    ])

    // node-b 内容区：x [200,300], y [228,300]
    const result = hitTestInlineViewWorld(250, 250, hostView, nodeStore)
    expect(result).toBe('node-b')
  })

  it('未命中任何内联视图时返回 null', () => {
    const nodeStore = createMockNodeStore({
      'node-1': { x: 100, y: 200, width: 300, height: 200 },
    })
    const hostView = createMockHostView([])

    const result = hitTestInlineViewWorld(250, 300, hostView, nodeStore)
    expect(result).toBeNull()
  })
})

describe('mapMainWorldToInlineWorld', () => {
  it('scale=1 stageX=0 基础情况', () => {
    const nodeStore = createMockNodeStore({
      'node-1': { x: 100, y: 200, width: 300, height: 200 },
    })
    const hostView = createMockHostView([
      { nodeId: 'node-1', viewId: 'iv-1', width: 300, height: 200 },
    ])
    const inlineView = createMockInlineView(0, 0, 1)

    // world (150, 250) -> 相对内容区左上角 (100, 200+28) 偏移 (50, 22)
    // 内部世界 = (50-0)/1, (22-0)/1 = (50, 22)
    const result = mapMainWorldToInlineWorld(150, 250, 'node-1', inlineView, hostView, nodeStore)
    expect(result).toEqual({ x: 50, y: 22 })
  })

  it('内联视图有缩放和偏移', () => {
    const nodeStore = createMockNodeStore({
      'node-1': { x: 100, y: 200, width: 300, height: 200 },
    })
    const hostView = createMockHostView([
      { nodeId: 'node-1', viewId: 'iv-1', width: 300, height: 200 },
    ])
    const inlineView = createMockInlineView(50, 30, 2)

    // world (150, 250) -> 相对内容区左上角偏移 (50, 22)
    // 像素 = (50-50)/2, (22-30)/2 = (0, -4)
    const result = mapMainWorldToInlineWorld(150, 250, 'node-1', inlineView, hostView, nodeStore)
    expect(result).toEqual({ x: 0, y: -4 })
  })

  it('节点或矩形缺失时返回兜底值', () => {
    const nodeStore = createMockNodeStore({})
    const hostView = createMockHostView([])
    const inlineView = createMockInlineView(0, 0, 1)

    const result = mapMainWorldToInlineWorld(150, 250, 'missing', inlineView, hostView, nodeStore)
    expect(result).toEqual({ x: 150, y: 250 })
  })

  it('inlineScale 为 0 时使用 1 防止除零', () => {
    const nodeStore = createMockNodeStore({
      'node-1': { x: 0, y: 0, width: 100, height: 100 },
    })
    const hostView = createMockHostView([
      { nodeId: 'node-1', viewId: 'iv-1', width: 100, height: 100 },
    ])
    const inlineView = createMockInlineView(0, 0, 0)

    // scale = 0 -> 使用 1
    // pixelX = 50 - 0 = 50, pixelY = 50 - 0 - 28 = 22
    // (50-0)/1 = 50, (22-0)/1 = 22
    const result = mapMainWorldToInlineWorld(50, 50, 'node-1', inlineView, hostView, nodeStore)
    expect(result).toEqual({ x: 50, y: 22 })
  })
})

describe('hitTestInlineViewScreen', () => {
  const containerRect = mockDOMRect({ left: 0, top: 0, width: 1200, height: 800 })

  it('应该命中覆盖层内的屏幕坐标', () => {
    const nodeStore = createMockNodeStore({
      'node-1': { x: 100, y: 200, width: 300, height: 200 },
    })
    const hostView = createMockHostView([
      { nodeId: 'node-1', viewId: 'iv-1', width: 300, height: 200 },
    ], 0, 0, 1)

    // 屏幕坐标: left=100, top=(200+28)=228, w=300, h=172
    const result = hitTestInlineViewScreen(250, 300, hostView, containerRect, nodeStore)
    expect(result).toBe('node-1')
  })

  it('覆盖层外的屏幕坐标不命中', () => {
    const nodeStore = createMockNodeStore({
      'node-1': { x: 100, y: 200, width: 300, height: 200 },
    })
    const hostView = createMockHostView([
      { nodeId: 'node-1', viewId: 'iv-1', width: 300, height: 200 },
    ], 0, 0, 1)

    const result = hitTestInlineViewScreen(50, 300, hostView, containerRect, nodeStore)
    expect(result).toBeNull()
  })

  it('宿主视图有缩放时正确计算', () => {
    const nodeStore = createMockNodeStore({
      'node-1': { x: 100, y: 200, width: 300, height: 200 },
    })
    const hostView = createMockHostView([
      { nodeId: 'node-1', viewId: 'iv-1', width: 300, height: 200 },
    ], 50, 30, 2)

    // left = 100*2 + 50 + 0 = 250
    // top = (200+28)*2 + 30 + 0 = 486
    // w = 300*2 = 600, h = (200-28)*2 = 344
    // 命中点: (300, 500)
    const result = hitTestInlineViewScreen(300, 500, hostView, containerRect, nodeStore)
    expect(result).toBe('node-1')
  })

  it('节点或矩形缺失时跳过', () => {
    const nodeStore = createMockNodeStore({})
    const hostView = createMockHostView([
      { nodeId: 'missing', viewId: 'iv-1', width: 300, height: 200 },
    ], 0, 0, 1)

    const result = hitTestInlineViewScreen(250, 300, hostView, containerRect, nodeStore)
    expect(result).toBeNull()
  })
})

describe('screenToMainWorld', () => {
  it('scale=1 stageX=0 stageY=0 基础情况', () => {
    const containerRect = mockDOMRect({ left: 10, top: 20, width: 1200, height: 800 })
    const mainView = createMockInlineView(0, 0, 1)

    // client(110, 120) -> world(100, 100)
    const result = screenToMainWorld(110, 120, containerRect, mainView)
    expect(result).toEqual({ x: 100, y: 100 })
  })

  it('有缩放和偏移', () => {
    const containerRect = mockDOMRect({ left: 10, top: 20, width: 1200, height: 800 })
    const mainView = createMockInlineView(50, 30, 2)

    // worldX = (210 - 10 - 50) / 2 = 75
    // worldY = (250 - 20 - 30) / 2 = 100
    const result = screenToMainWorld(210, 250, containerRect, mainView)
    expect(result).toEqual({ x: 75, y: 100 })
  })

  it('stageScale 为 0 时使用 1 防止除零', () => {
    const containerRect = mockDOMRect({ left: 0, top: 0, width: 1200, height: 800 })
    const mainView = createMockInlineView(0, 0, 0)

    // scale = 0 -> 使用 1
    const result = screenToMainWorld(100, 200, containerRect, mainView)
    expect(result).toEqual({ x: 100, y: 200 })
  })
})

describe('screenToInlineWorld', () => {
  const containerRect = mockDOMRect({ left: 0, top: 0, width: 1200, height: 800 })

  it('基础情况：宿主和内部均无偏移/缩放', () => {
    const nodeStore = createMockNodeStore({
      'node-1': { x: 100, y: 200, width: 300, height: 200 },
    })
    const hostView = createMockHostView([
      { nodeId: 'node-1', viewId: 'iv-1', width: 300, height: 200 },
    ], 0, 0, 1)
    const inlineView = createMockInlineView(0, 0, 1)

    // screen(150, 250) -> 宿主覆盖层: left=100, top=228
    // pixelX = (150-100)/1 = 50, pixelY = (250-228)/1 = 22
    // inlineWorld = (50-0)/1 = 50, (22-0)/1 = 22
    const result = screenToInlineWorld(150, 250, 'node-1', inlineView, hostView, containerRect, nodeStore)
    expect(result).toEqual({ x: 50, y: 22 })
  })

  it('宿主有缩放时正确映射', () => {
    const nodeStore = createMockNodeStore({
      'node-1': { x: 100, y: 200, width: 300, height: 200 },
    })
    const hostView = createMockHostView([
      { nodeId: 'node-1', viewId: 'iv-1', width: 300, height: 200 },
    ], 50, 30, 2)
    const inlineView = createMockInlineView(10, 20, 1.5)

    // 宿主覆盖层: left = 100*2 + 50 + 0 = 250
    //              top = (200+28)*2 + 30 + 0 = 486
    // pixelX = (300-250)/2 = 25, pixelY = (500-486)/2 = 7
    // inlineWorld = (25-10)/1.5 = 10, (7-20)/1.5 = -8.666...
    const result = screenToInlineWorld(300, 500, 'node-1', inlineView, hostView, containerRect, nodeStore)
    expect(result.x).toBeCloseTo(10, 5)
    expect(result.y).toBeCloseTo(-8.666666, 5)
  })

  it('节点或矩形缺失时返回兜底值', () => {
    const nodeStore = createMockNodeStore({})
    const hostView = createMockHostView([], 0, 0, 1)
    const inlineView = createMockInlineView(0, 0, 1)

    const result = screenToInlineWorld(150, 250, 'missing', inlineView, hostView, containerRect, nodeStore)
    expect(result).toEqual({ x: 150, y: 250 })
  })
})
