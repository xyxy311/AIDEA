import type { CanvasPosition } from '@/types'

/**
 * 将节点位置限制在画布可视范围内
 * 节点中心点被限制在 [0, stageWidth] x [0, stageHeight] 区间，
 * 允许最多一半节点尺寸溢出画布边缘。
 *
 * @param x - 节点目标 x 坐标
 * @param y - 节点目标 y 坐标
 * @param stageWidth - 画布宽度
 * @param stageHeight - 画布高度
 * @param _nodeWidth - 节点宽度（保留参数，用于后续溢出比例计算）
 * @param _nodeHeight - 节点高度
 * @returns 限制后的 { x, y } 坐标
 */
export function clampPosition(
  x: number,
  y: number,
  stageWidth: number,
  stageHeight: number,
  _nodeWidth: number = 0,
  _nodeHeight: number = 0,
): CanvasPosition {
  return {
    x: Math.max(0, Math.min(x, stageWidth)),
    y: Math.max(0, Math.min(y, stageHeight)),
  }
}

// ── 文本测量 ──

/** 缓存的 Canvas 2D 上下文（浏览器环境用于精确文本测量） */
let _measureCtx: CanvasRenderingContext2D | null | undefined

/**
 * 获取用于文本测量的 Canvas 2D 上下文。
 * 浏览器环境返回真实上下文；非浏览器或不可用时返回 null。
 * 结果会被缓存，避免反复创建 canvas 元素。
 */
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx !== undefined) return _measureCtx
  try {
    if (typeof document === 'undefined') {
      _measureCtx = null
      return null
    }
    _measureCtx = document.createElement('canvas').getContext('2d')
    return _measureCtx
  } catch {
    _measureCtx = null
    return null
  }
}

/**
 * 字符宽度估算（Canvas API 不可用时的回退方案）
 *
 * CJK 字符及全角标点 ≈ 1 个字号宽度；
 * 空白字符 ≈ 0.3 个字号；其他 ASCII ≈ 0.6 个字号。
 */
function estimateCharWidth(char: string, fontSize: number): number {
  if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char)) {
    return fontSize
  }
  if (char === ' ' || char === '\t') {
    return fontSize * 0.3
  }
  return fontSize * 0.6
}

/**
 * 测量单行文本宽度。
 * 优先使用 Canvas API 精确测量；不可用时回退到逐字符估算。
 * 导出供 reference.ts 复用（节点引用文本布局）。
 */
export function measureLineWidth(text: string, fontSize: number, fontFamily: string): number {
  if (!text) return 0

  const ctx = getMeasureCtx()
  if (ctx) {
    ctx.font = `${fontSize}px ${fontFamily}`
    const w = ctx.measureText(text).width
    if (w > 0) return w
  }

  let width = 0
  for (const char of text) {
    width += estimateCharWidth(char, fontSize)
  }
  return width
}

/**
 * 估算文本渲染尺寸（粗略，向后兼容）。
 * 基于字符数和字体大小的近似计算，不模拟换行。
 *
 * @param text - 文本内容
 * @param fontSize - 字体大小（px）
 * @returns 估算的 { width, height }
 */
export function measureText(text: string, fontSize: number): { width: number; height: number } {
  if (!text || text.length === 0) {
    return { width: 0, height: fontSize * 1.5 }
  }

  let width = 0
  for (const char of text) {
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char)) {
      width += fontSize
    } else {
      width += fontSize * 0.6
    }
  }

  return {
    width: Math.ceil(width),
    height: Math.ceil(fontSize * 1.5), // 行高 1.5
  }
}

/**
 * 计算文本在给定宽度内按字符换行后所需的内容尺寸。
 *
 * 模拟 Konva Text（wrap = 'char'）的换行行为：
 * 1. 按换行符 `\n` 分割段落
 * 2. 每段逐字符填充到当前行，超出 maxWidth 时换行
 * 3. 返回所有行中最大宽度与总高度（均不含 padding）
 *
 * 字符宽度优先使用 Canvas API 精确测量，不支持时回退到字符估算。
 * 换行判断基于字符宽度累加（略保守），保证文字不会被裁剪。
 *
 * @param text       - 文本内容（可含 `\n`）
 * @param fontSize   - 字体大小（px）
 * @param fontFamily - 字体族
 * @param maxWidth   - 单行最大宽度（内容区宽度，不含 padding）
 * @param lineHeight - 行高倍率，默认 1.5
 * @returns 所需内容尺寸 `{ width, height }`（不含 padding）
 */
export function calculateTextContentSize(
  text: string,
  fontSize: number,
  fontFamily: string,
  maxWidth: number,
  lineHeight: number = 1.5,
): { width: number; height: number } {
  // 空文本：仍占一行高度
  if (!text || text.length === 0) {
    return { width: 0, height: Math.ceil(fontSize * lineHeight) }
  }

  // 预计算字符宽度，避免重复测量
  const charWidthCache = new Map<string, number>()
  function getCharWidth(char: string): number {
    let w = charWidthCache.get(char)
    if (w === undefined) {
      w = measureLineWidth(char, fontSize, fontFamily)
      charWidthCache.set(char, w)
    }
    return w
  }

  // 按段落 → 逐字符换行
  const paragraphs = text.split('\n')
  const lines: string[] = []

  for (const para of paragraphs) {
    if (para.length === 0) {
      lines.push('')
      continue
    }

    let currentLine = ''
    let currentWidth = 0

    for (const char of para) {
      const charWidth = getCharWidth(char)

      // 当前行加上此字符会超出宽度，且当前行非空 → 换行
      if (currentWidth + charWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine)
        currentLine = char
        currentWidth = charWidth
      } else {
        currentLine += char
        currentWidth += charWidth
      }
    }

    lines.push(currentLine)
  }

  // 最大行宽度（用整行精确测量，修正 kerning 差异）
  let maxLineWidth = 0
  for (const line of lines) {
    if (line.length === 0) continue
    const lineWidth = measureLineWidth(line, fontSize, fontFamily)
    if (lineWidth > maxLineWidth) maxLineWidth = lineWidth
  }

  const lineHeightPx = fontSize * lineHeight

  return {
    width: Math.ceil(maxLineWidth),
    height: Math.ceil(lines.length * lineHeightPx),
  }
}
