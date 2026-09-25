// 几何/文本测量工具：画布范围钳制，以及基于 Canvas API（回退逐字符估算）的文本尺寸与换行计算。
import type { CanvasPosition } from '@/types'

/** 将节点坐标限制在画布可视范围内；_nodeWidth/_nodeHeight 为保留参数（供后续溢出比例计算）。 */
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

/** 获取用于文本测量的 Canvas 2D 上下文（结果缓存，非浏览器或不可用时返回 null）。 */
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

/** 字符宽度估算（Canvas 不可用时的回退）：CJK/全角≈1、空白≈0.3、其他 ASCII≈0.6 字号。 */
function estimateCharWidth(char: string, fontSize: number): number {
  if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char)) {
    return fontSize
  }
  if (char === ' ' || char === '\t') {
    return fontSize * 0.3
  }
  return fontSize * 0.6
}

/** 测量单行文本宽度：优先 Canvas 精确测量，否则逐字符估算。导出供 reference.ts 复用。 */
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

/** 估算文本渲染尺寸（粗略，不模拟换行）。 */
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
 * 计算文本按字符换行后的内容尺寸（模拟 Konva Text wrap='char'）：
 * 按 `\n` 分段、逐字符填充，超出 maxWidth 即换行，返回最大行宽与总高（均不含 padding）。
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
