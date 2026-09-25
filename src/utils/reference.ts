// 节点引用纯函数层：`#` 开头可定义引用（名取第一行去 `#` 并 trim）；`@名字` 引用他人需前后分隔。
// 提供引用名提取、片段解析（reference token）、编辑器补全与文本布局。纯函数不依赖 store。
import { measureLineWidth } from '@/utils/geometry'

/** 文本片段（逻辑行内） */
export interface Segment {
  /** 'text' 普通文本 | 'ref' 引用片段 */
  type: 'text' | 'ref'
  /** 片段原始文本（ref 时含 @，如 '@需求'） */
  text: string
  /** 仅 ref 时有值：引用名（不含 @） */
  refName?: string
}

/** 布局后的显示行 */
export interface LayoutLine {
  /** 本行的片段序列（已按字符换行拆分，ref token 不可拆除非本身超宽） */
  segments: Segment[]
  /** 本行总宽度（px，不含 padding） */
  width: number
  /** 本行 x 坐标（已水平居中：(contentWidth - width) / 2，不含 padding） */
  x: number
  /** 本行 y 坐标（已垂直居中，y 从 0 累加，不含 padding） */
  y: number
}

/** 提取引用名：严格 `#` 开头（不 trim 前导空白，` #x` 不算）；去 `#` 取第一行并 trim，非空返回否则 null。 */
export function extractReferenceName(text: string): string | null {
  if (!text.startsWith('#')) return null
  const firstLine = text.split('\n')[0]
  const name = firstLine.slice(1).trim()
  return name.length > 0 ? name : null
}

/**
 * 解析单逻辑行为片段序列：`@` 且前一字符为行首或空格时，收集名字直到空格/换行/行尾，
 * 名字非空即形成 ref 片段（如 `@需求 x` → '需求'，`@需求其他` 行尾 → '需求其他'）；
 * `@` 后立即空格名字为空 → 不算引用。空行返回含空 text 片段以便布局占一行高。
 */
function parseLine(line: string): Segment[] {
  const segments: Segment[] = []
  const n = line.length
  let i = 0
  // text 缓冲区的起始下标（用于合并连续普通字符为一个 text 片段）
  let textBufStart = 0

  /** 将 [textBufStart, end) 的文本作为 text 片段 flush 进 segments */
  function flushText(end: number): void {
    if (end > textBufStart) {
      segments.push({ type: 'text', text: line.slice(textBufStart, end) })
    }
  }

  while (i < n) {
    const ch = line[i]
    if (ch === '@' && (i === 0 || line[i - 1] === ' ')) {
      // 收集名字直到空格或行尾
      let j = i + 1
      while (j < n && line[j] !== ' ') j++
      const name = line.slice(i + 1, j)
      const terminatedBySpace = j < n && line[j] === ' '
      const terminatedByEnd = j >= n
      if (name.length > 0 && (terminatedBySpace || terminatedByEnd)) {
        // 有效引用：flush 缓冲文本，push ref 片段
        flushText(i)
        segments.push({ type: 'ref', text: '@' + name, refName: name })
        i = j
        textBufStart = i
        continue
      }
    }
    i++
  }
  flushText(n)

  // 空行（无任何内容）返回含空 text 片段的数组，保证布局占一行高
  if (segments.length === 0) {
    return [{ type: 'text', text: '' }]
  }
  return segments
}

/** 按 `\n` 拆逻辑行，返回每行的片段序列（空行返回含空 text 片段）。 */
export function parseReferenceSegments(text: string): Segment[][] {
  const lines = text.split('\n')
  const result: Segment[][] = []
  for (const line of lines) {
    result.push(parseLine(line))
  }
  return result
}

/**
 * 编辑器实时补全：从 cursorPos 向前找最近的合法 `@`（前一字符为行首/空格/换行/起始），
 * 其后的子串（去末尾空白后不含空格/换行）作为 name 前缀；否则不在补全态，返回 { start, name } 或 null。
 */
export function findReferenceAt(
  text: string,
  cursorPos: number,
): { start: number; name: string } | null {
  for (let i = cursorPos - 1; i >= 0; i--) {
    if (text[i] !== '@') continue
    // @ 前一字符必须是行首/空格/换行/起始
    const prev = i === 0 ? '' : text[i - 1]
    if (prev !== '' && prev !== ' ' && prev !== '\n') continue
    // 从 @ 后到 cursor 的子串作为 name 前缀；去掉末尾空白后若仍含空格/换行则非补全态
    const sub = text.slice(i + 1, cursorPos).replace(/[ \n]+$/, '')
    if (sub.includes(' ') || sub.includes('\n')) continue
    return { start: i, name: sub }
  }
  return null
}

/**
 * 把逻辑行片段布局为显示行：ref 作为整体 token，放得下则放入否则换行（token 本身超宽时按字符拆分），
 * text 逐字符填充超宽换行；x 相对内容区水平居中，y 从 0 按行高累加（均不含 padding）。
 */
export function layoutReferenceText(
  paragraphs: Segment[][],
  contentWidth: number,
  fontSize: number,
  fontFamily: string,
  lineHeight: number,
): LayoutLine[] {
  const lineHeightPx = fontSize * lineHeight
  const lines: LayoutLine[] = []

  // 当前显示行缓冲
  let currentSegs: Segment[] = []
  let currentWidth = 0

  /** 把当前缓冲行 flush 进 lines（计算水平居中 x 与行 y） */
  function flushLine(): void {
    lines.push({
      segments: currentSegs,
      width: currentWidth,
      x: (contentWidth - currentWidth) / 2,
      y: lines.length * lineHeightPx,
    })
    currentSegs = []
    currentWidth = 0
  }

  /** 把超宽 ref token 按字符拆分为 text 片段布局（兜底） */
  function layoutTokenAsChars(tokenText: string): void {
    for (const char of tokenText) {
      const cw = measureLineWidth(char, fontSize, fontFamily)
      if (currentWidth + cw > contentWidth && currentSegs.length > 0) flushLine()
      currentSegs.push({ type: 'text', text: char })
      currentWidth += cw
    }
  }

  for (const para of paragraphs) {
    for (const seg of para) {
      if (seg.type === 'ref') {
        const tokenWidth = measureLineWidth(seg.text, fontSize, fontFamily)
        if (tokenWidth > contentWidth) {
          // token 本身超宽，整体无法放入一行 -> 按字符拆分
          flushLine()
          layoutTokenAsChars(seg.text)
        } else if (currentWidth + tokenWidth > contentWidth && currentSegs.length > 0) {
          // 当前行放不下 -> 换行后放入
          flushLine()
          currentSegs.push(seg)
          currentWidth = tokenWidth
        } else {
          currentSegs.push(seg)
          currentWidth += tokenWidth
        }
      } else {
        // text 片段按字符逐个填充
        for (const char of seg.text) {
          const cw = measureLineWidth(char, fontSize, fontFamily)
          if (currentWidth + cw > contentWidth && currentSegs.length > 0) flushLine()
          currentSegs.push({ type: 'text', text: char })
          currentWidth += cw
        }
      }
    }
    // 每个逻辑行结束后 flush（空行 -> 空缓冲 -> 占一行高的空行）
    flushLine()
  }

  return lines
}