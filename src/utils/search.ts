/**
 * 节点搜索 - 纯函数层
 *
 * 背景语义：
 * - 搜索整个 node.text（含多行），不区分大小写。
 * - 根节点（parentId === null，即项目名）不参与搜索。
 * - 结果展示两行：
 *   标题行（首行）+ 命中行片段（命中在首行时不重复展示 body）。
 * - 高亮：把命中片段与普通片段切分开，供 UI 分别着色。
 *
 * 本文件只包含纯函数与类型，不依赖 store，便于单测与复用。
 */
import type { WhiteboardNode } from '@/types'

/** 高亮分段：match=true 表示命中查询的片段 */
export interface HighlightSegment {
  text: string
  match: boolean
}

/** 单条搜索结果（供面板渲染两行） */
export interface SearchNodeResult {
  nodeId: string
  /** 标题行（首行）分段 */
  title: HighlightSegment[]
  /** 命中行片段；命中在首行时为 null（避免重复展示同一段） */
  body: HighlightSegment[] | null
}

/**
 * 把整行按命中切成分段（不截断，保留原始大小写）。
 * query 为空或 line 为空时返回单个非命中分段。
 */
export function highlightLine(line: string, query: string): HighlightSegment[] {
  if (!line || !query) return line ? [{ text: line, match: false }] : []
  const lower = line.toLowerCase()
  const q = query.toLowerCase()
  const segments: HighlightSegment[] = []
  let cursor = 0
  let idx = lower.indexOf(q)
  while (idx !== -1) {
    if (idx > cursor) segments.push({ text: line.slice(cursor, idx), match: false })
    segments.push({ text: line.slice(idx, idx + q.length), match: true })
    cursor = idx + q.length
    idx = lower.indexOf(q, cursor)
  }
  if (cursor < line.length) segments.push({ text: line.slice(cursor), match: false })
  if (segments.length === 0) segments.push({ text: line, match: false })
  return segments
}

/** 默认最长可显示字符数（超出部分用省略号，命中片段保证完整可见） */
const DEFAULT_MAX_CHARS = 60

/** 搜索范围：'project' 全项目 / 'view' 当前视图 */
export type SearchScope = 'project' | 'view'

/** 搜索选项 */
export interface SearchOptions {
  /** 搜索范围：'project' 全项目 / 'view' 当前视图 */
  scope?: SearchScope
  /** scope='view' 时，当前查看的节点 ID（取其直接子级作为搜索结果集） */
  viewedNodeId?: string
  /**
   * 按标签过滤：节点须同时包含全部所选标签（AND 语义）。
   * 空数组 / undefined 表示不过滤。
   */
  tagIds?: string[]
  /** 最长可显示字符数 */
  maxChars?: number
}

/**
 * 构建单行展示用的分段。
 * 长度 ≤ maxChars 时直接返回整行高亮；超长时以命中点为中心取窗口，
 * 两侧补 '…'（命中完整可见）。无命中时截尾补 '…'。
 */
export function buildDisplayLine(
  line: string,
  query: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): HighlightSegment[] {
  if (!line) return []
  if (line.length <= maxChars) return highlightLine(line, query)

  const lower = line.toLowerCase()
  const q = query.toLowerCase()
  const idx = lower.indexOf(q)

  // 无命中：截尾 + 省略号
  if (idx === -1) {
    return [{ text: line.slice(0, maxChars), match: false }, { text: '…', match: false }]
  }

  // 有命中：以命中中心取窗口，先夹到 [0, len-window]，再保证命中完整落在窗口内
  const windowLength = maxChars
  let windowStart = idx - Math.floor((windowLength - q.length) / 2)
  windowStart = Math.max(0, Math.min(windowStart, line.length - windowLength))
  const matchEnd = idx + q.length
  if (windowStart + windowLength < matchEnd) {
    windowStart = matchEnd - windowLength
  }
  windowStart = Math.max(0, windowStart)

  const window = line.slice(windowStart, windowStart + windowLength)
  const hasPrefix = windowStart > 0
  const hasSuffix = windowStart + windowLength < line.length

  const segments: HighlightSegment[] = []
  if (hasPrefix) segments.push({ text: '…', match: false })
  segments.push(...highlightLine(window, query))
  if (hasSuffix) segments.push({ text: '…', match: false })
  return segments
}

/**
 * 组装两行展示分段：
 * - title = 首行（命中在首行时高亮并截断，否则普通截断）
 * - body  = 命中行以命中点为中心的片段；命中在首行时 null
 */
export function buildSearchLines(
  text: string,
  query: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): { title: HighlightSegment[]; body: HighlightSegment[] | null } {
  const lines = text.split('\n')
  const q = query.toLowerCase()
  const matchedIndex = lines.findIndex((l) => l.toLowerCase().includes(q))

  const title = buildDisplayLine(lines[0] ?? '', query, maxChars)
  if (matchedIndex <= 0) {
    return { title, body: null }
  }
  const body = buildDisplayLine(lines[matchedIndex], query, maxChars)
  return { title, body }
}

/**
 * 全树搜索（排除根节点），query 为空 / 全空白返回 []。
 * 搜索整个 node.text（含多行），大小写不敏感。
 * options.scope='view' 时仅搜索指定视图（viewedNodeId）的直接子级。
 */
export function searchNodes(
  nodes: WhiteboardNode[],
  query: string,
  options: SearchOptions = {},
): SearchNodeResult[] {
  const { scope = 'project', viewedNodeId = '', tagIds = [], maxChars = DEFAULT_MAX_CHARS } = options
  const q = query.trim().toLowerCase()
  if (!q) return []
  const results: SearchNodeResult[] = []
  for (const node of nodes) {
    if (node.parentId === null) continue
    if (scope === 'view' && node.parentId !== viewedNodeId) continue
    // 标签过滤：仅当 tagIds 非空时启用；节点须同时包含全部所选标签（AND）。
    // 用 node.tagIds?.includes 容错节点可能缺 tagIds 字段。
    if (tagIds.length > 0 && !(tagIds.every((tid) => node.tagIds?.includes(tid)))) continue
    if (node.text.toLowerCase().includes(q)) {
      const { title, body } = buildSearchLines(node.text, query, maxChars)
      results.push({ nodeId: node.id, title, body })
    }
  }
  return results
}