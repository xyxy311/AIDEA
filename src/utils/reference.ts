/**
 * 节点引用 - 纯函数层
 *
 * 背景语义：
 * - 定义引用：节点 text 以 `#` 开头 -> 可被引用；引用名 = 去掉 `#` 后取第一行（`\n` 前）并 trim。
 * - 引用他人：节点 text 中 `@节点名`，前后都需分隔（@ 前为行首/空格/换行，@ 后为空格/换行/行尾）才算引用。
 * - 重名禁止：`#` 引用名与已有引用重名时阻止修改。
 *
 * 本文件只包含纯函数与类型，不依赖 store，便于单测与复用。
 */
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

/**
 * 提取引用名。
 *
 * 决策：严格 `startsWith('#')`，不 trim 前导空白（` #x` 前导空格不算）。
 * 引用名 = 去掉 `#` 后取第一行（`\n` 前）并 trim；结果非空则返回，否则 null。
 *
 * @param text - 节点文本
 * @returns 引用名；不是引用或名为空时返回 null
 */
export function extractReferenceName(text: string): string | null {
  if (!text.startsWith('#')) return null
  const firstLine = text.split('\n')[0]
  const name = firstLine.slice(1).trim()
  return name.length > 0 ? name : null
}

/**
 * 解析单逻辑行，产出片段序列。
 *
 * 引用识别规则：`@` 且其前一字符为行首或空格时，开始收集名字直到遇到空格/换行/行尾。
 * 名字非空即形成 ref 片段（refName = 名字）。
 *
 * 解析决策（代码注释写明）：`@` 后收集名字直到遇到空格/换行/行尾，名字非空即形成 ref 片段。
 * 即 `@需求其他`（行尾）-> refName='需求其他'；`@需求 x` -> refName='需求'。
 * 行尾也视为终止分隔符。`@` 后立即空格（`@ `）名字为空 -> 不算引用，`@` 作为普通文本。
 * 空行返回 `[{ type:'text', text:'' }]` 以便布局占一行高。
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

/**
 * 按 `\n` 拆逻辑行，每行返回其片段序列。
 *
 * @param text - 原始文本（可含 `\n`）
 * @returns Segment[][]，每个内层数组是逻辑行的片段；空行返回 `[{type:'text',text:''}]`
 */
export function parseReferenceSegments(text: string): Segment[][] {
  const lines = text.split('\n')
  const result: Segment[][] = []
  for (const line of lines) {
    result.push(parseLine(line))
  }
  return result
}

/**
 * 编辑器实时补全：判断光标是否处于 `@...` 输入中。
 *
 * 从 cursorPos 向前找最近的 `@`（在 cursorPos 之前或等于），检查该 `@` 前一字符
 * 是否为行首/空格/换行/起始。从 `@` 后到 cursorPos 的子串作为当前输入的 name 前缀，
 * 去除末尾空白后若仍含空格/换行则不在补全态；否则返回 `{ start: @索引, name: 前缀 }`。
 *
 * 说明：cursorPos 可能在 `@` 处（name 为空）。为兼容"光标紧跟在已补全名字后的空格之后"
 * 场景（如 `@需求 其`，光标在空格后、名字已完整），允许去掉末尾空白后判断。
 *
 * @param text - 编辑中的完整文本
 * @param cursorPos - 光标位置（0..text.length）
 * @returns 补全上下文 `{ start, name }`；不在补全态返回 null
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
 * 把逻辑行片段布局为显示行。
 *
 * contentWidth = node.width - padding*2。字符宽度测量复用 geometry 的 measureLineWidth。
 *
 * 算法：
 * - ref 片段作为整体 token（宽度 = measureLineWidth('@'+refName)）。当前行放得下则放入，
 *   放不下则换行；token 本身宽度 > contentWidth 时按字符拆分其 text 作为 text 片段布局（兜底）。
 * - text 片段按字符逐个填充，超出 contentWidth 时换行。
 *
 * 返回坐标：x 相对内容区左上角水平居中（不含 padding），y 从 0 按行高累加（不含 padding），
 * 调用方（WhiteboardNode）再叠加 padding 与垂直居中偏移。
 *
 * @param paragraphs  - 逻辑行片段序列（parseReferenceSegments 的产物）
 * @param contentWidth - 内容区宽度（不含 padding）
 * @param fontSize    - 字体大小（px）
 * @param fontFamily  - 字体族
 * @param lineHeight  - 行高倍率
 * @returns 显示行列表
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