// src/mcp/__tests__/screenshot.test.ts —— T20 截图纯函数：包围盒 / 世界→屏幕换算 / pixelRatio 上限 / worldRect 校验
import { describe, expect, it } from 'vitest'
import { capturePixelRatio, parseWorldRect, worldBoundsOf, worldToScreenRect, type WorldRect } from '../screenshot'
import { ToolError } from '../tools/shared'
import type { WhiteboardNode } from '@/types'

function node(partial: Partial<WhiteboardNode>): WhiteboardNode {
  return { id: 'n', parentId: 'root', x: 0, y: 0, width: 100, height: 50, text: '', tagIds: [], borderColor: '#000000', connections: [], ...partial }
}

/** 最小 Stage 桩：scale + offset 可指定 */
function stageLike(scale: number, offsetX: number, offsetY: number) {
  return {
    width: () => 1000,
    height: () => 800,
    x: () => offsetX,
    y: () => offsetY,
    scaleX: () => scale,
    scaleY: () => scale,
    container: () => null,
    toDataURL: () => '',
  }
}

describe('worldBoundsOf —— 节点集合世界包围盒', () => {
  it('空集合返回 null', () => {
    expect(worldBoundsOf([])).toBeNull()
  })

  it('多节点取并集（含负坐标）', () => {
    const rect = worldBoundsOf([node({ x: -50, y: 100 }), node({ x: 200, y: -30, width: 60, height: 40 })])
    expect(rect).toEqual({ x: -50, y: -30, width: 310, height: 180 })
  })
})

describe('worldToScreenRect —— 世界→屏幕换算（不随视口漂移的关键）', () => {
  it('screen = world × scale + offset；宽高只乘 scale', () => {
    const rect = worldToScreenRect(stageLike(0.5, 120, -40), { x: 100, y: 200, width: 300, height: 80 })
    expect(rect).toEqual({ x: 170, y: 60, width: 150, height: 40 })
  })

  it('scale=1、offset=0 时退化为原矩形', () => {
    const world: WorldRect = { x: 10, y: 20, width: 30, height: 40 }
    expect(worldToScreenRect(stageLike(1, 0, 0), world)).toEqual(world)
  })
})

describe('capturePixelRatio —— 输出尺寸护栏', () => {
  it('常规小区域放大到 maxWidth 以内（≤2 倍）', () => {
    expect(capturePixelRatio(600, 400, 1024)).toBe(1024 / 600)
  })

  it('超宽区域降采样到 maxWidth', () => {
    expect(capturePixelRatio(5000, 100, 1024)).toBeCloseTo(1024 / 5000)
  })

  it('极高区域受画布单边上限约束（16M 像素与 16384 单边双重护栏）', () => {
    const ratio = capturePixelRatio(100, 400_000, 1024)
    // 输出高度 = 400000 × ratio ≤ 16384
    expect(400_000 * ratio).toBeLessThanOrEqual(16384)
  })
})

describe('parseWorldRect —— worldRect 入参校验', () => {
  it('缺省返回 null', () => {
    expect(parseWorldRect(undefined)).toBeNull()
    expect(parseWorldRect(null)).toBeNull()
  })

  it('合法矩形原样返回', () => {
    expect(parseWorldRect({ x: 1, y: -2, width: 3, height: 4 })).toEqual({ x: 1, y: -2, width: 3, height: 4 })
  })

  it('非法形状 / 宽高 ≤ 0 抛 ToolError', () => {
    expect(() => parseWorldRect({ x: 'a', y: 0, width: 1, height: 1 })).toThrow(ToolError)
    expect(() => parseWorldRect({ x: 0, y: 0, width: 0, height: 1 })).toThrow(ToolError)
    expect(() => parseWorldRect({ x: 0, y: 0, width: 1, height: -1 })).toThrow(ToolError)
  })
})
