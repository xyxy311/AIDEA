/**
 * mcp/screenshot.ts —— T20 截图的纯数学（包围盒 / 世界→屏幕换算 / 输出尺寸护栏 / 入参校验）。
 * 与 registry 解耦，可独立单测；StageLike 为 konva Stage 的结构化最小类型（零类型耦合）。
 */
import type { WhiteboardNode } from '@/types'
import { MCP_SCREENSHOT_MAX_EDGE_PX } from './constants'
import { ToolError } from './tools/shared'

/** 世界坐标矩形 */
export interface WorldRect {
  x: number
  y: number
  width: number
  height: number
}

/** konva 结构化最小类型（规避 konva 包类型入口对 Stage/stages 的导出差异，零类型耦合） */
export interface StageLike {
  width(): number
  height(): number
  /** Stage 视口变换（screen = world × scale + offset，变换挂在 Stage 节点上） */
  x(): number
  y(): number
  scaleX(): number
  scaleY(): number
  container(): HTMLElement | null
  toDataURL(config: { pixelRatio?: number; x?: number; y?: number; width?: number; height?: number }): string
}

/** 节点集合的世界包围盒（节点 rect 并集；连线/箭头/标注均在端点包围盒内） */
export function worldBoundsOf(nodes: readonly WhiteboardNode[]): WorldRect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null
}

/** 世界矩形 → Stage 屏幕矩形（Konva toDataURL 的 x/y/width/height 按屏幕坐标裁剪并重绘，视口外内容同样可捕获） */
export function worldToScreenRect(stage: StageLike, rect: WorldRect): WorldRect {
  return {
    x: rect.x * stage.scaleX() + stage.x(),
    y: rect.y * stage.scaleY() + stage.y(),
    width: rect.width * stage.scaleX(),
    height: rect.height * stage.scaleY(),
  }
}

/** 按 maxWidth 上限、总像素上限与画布单边上限计算 capture pixelRatio */
export function capturePixelRatio(captureWidth: number, captureHeight: number, maxWidth: number): number {
  const maxDim = Math.max(captureWidth, captureHeight, 1)
  const edgeRatio = MCP_SCREENSHOT_MAX_EDGE_PX / maxDim
  let ratio = Math.min(2, maxWidth / Math.max(captureWidth, 1), edgeRatio)
  const maxPixels = 16_000_000
  const pixels = captureWidth * captureHeight
  if (pixels * ratio * ratio > maxPixels) {
    ratio = Math.sqrt(maxPixels / pixels)
  }
  // 单边上限最优先（超限渲染直接失败），0.05 下限不得突破它
  ratio = Math.min(ratio, edgeRatio)
  return Math.max(ratio, Math.min(0.05, edgeRatio))
}

/** 校验 worldRect 入参（四个有限数，宽高 > 0；缺省返回 null） */
export function parseWorldRect(value: unknown): WorldRect | null {
  if (value === undefined || value === null) return null
  const r = value as Record<string, unknown>
  const nums = ['x', 'y', 'width', 'height'].map((k) => r[k])
  if (nums.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new ToolError('worldRect must be { x, y, width, height } with finite numbers')
  }
  if ((nums[2] as number) <= 0 || (nums[3] as number) <= 0) {
    throw new ToolError('worldRect width and height must be > 0')
  }
  return { x: nums[0] as number, y: nums[1] as number, width: nums[2] as number, height: nums[3] as number }
}
