/**
 * mcp/viewText.ts —— MCP 专用视图转文本：直线命中（lineHit）单一算法。
 * 纯函数、零依赖（不读 store、不 import plugins/，自带 McpViewNode 类型）。
 * 与 plugins/ai/utils/viewText.ts 的 lineHit 行为等价（对照测试锁定行分组一致），
 * 刻意复制而不共用：消费者/边界/演进节奏不同（见 plan §4.5）。
 */

/** 算法输入节点：仅需几何与文本（隔离 store 依赖） */
export interface McpViewNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
}

/** 固定参数（不暴露给模型；与插件版 schema 默认值一致以便对照） */
export const LINE_HIT_PARAMS: { yThreshold: number; offset: number; overlapRatio: number } = {
  yThreshold: 10,
  offset: 0,
  overlapRatio: 0.5,
}

/** 取文本首行（去首尾空白）；空文本 → '' */
function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? ''
  return line.trim()
}

/**
 * 直线命中聚行（复刻插件版算法，固定参数语义）：
 * 1) 中心 y 升序 + 阈值去重得基础 Y 列表；2) 搜索线 = 保留中心 + offset；
 * 3) 逐线收集命中节点（严格穿内部 node.y < lineY < node.y+height），空行跳过；
 * 4) 相邻行按重复率去重（≥ overlapRatio 时从较短行移除重复项，去空行作废/顶替）。
 */
export function lineHitRows(nodes: McpViewNode[], params?: typeof LINE_HIT_PARAMS): McpViewNode[][] {
  const yThreshold = params?.yThreshold ?? LINE_HIT_PARAMS.yThreshold
  const offset = params?.offset ?? LINE_HIT_PARAMS.offset
  const overlapRatio = params?.overlapRatio ?? LINE_HIT_PARAMS.overlapRatio

  // 1. 空输入
  if (nodes.length === 0) return []

  // 2. 中心 y 升序 + 阈值去重
  const withCenter = nodes.map((node) => ({ node, centerY: node.y + node.height / 2 }))
  withCenter.sort((a, b) => a.centerY - b.centerY)
  const kept: number[] = []
  for (const item of withCenter) {
    if (kept.length === 0 || item.centerY - kept[kept.length - 1] >= yThreshold) {
      kept.push(item.centerY)
    }
  }

  // 3. 搜索线坐标
  const searchYs = kept.map((c) => c + offset)

  // 4. 逐线收集命中行（严格穿内部），空行跳过
  const rawRows: McpViewNode[][] = []
  for (const lineY of searchYs) {
    const row = nodes.filter((node) => node.y < lineY && lineY < node.y + node.height)
    if (row.length > 0) rawRows.push(row)
  }

  // 5. 相邻行按重复率去重合并
  const mergedRows: McpViewNode[][] = []
  for (const row of rawRows) {
    if (mergedRows.length === 0) {
      mergedRows.push([...row])
      continue
    }
    const prev = mergedRows[mergedRows.length - 1]
    const prevSet = new Set(prev.map((n) => n.id))
    const repeated = row.filter((n) => prevSet.has(n.id)).length
    const ratio = repeated / Math.min(prev.length, row.length)
    if (ratio >= overlapRatio) {
      if (row.length <= prev.length) {
        const filtered = row.filter((n) => !prevSet.has(n.id))
        if (filtered.length > 0) mergedRows.push(filtered)
      } else {
        const rowSet = new Set(row.map((n) => n.id))
        const filtered = prev.filter((n) => !rowSet.has(n.id))
        if (filtered.length > 0) mergedRows[mergedRows.length - 1] = filtered
        else mergedRows[mergedRows.length - 1] = [...row]
      }
    } else {
      mergedRows.push([...row])
    }
  }

  // 6. 行内按 x 升序
  return mergedRows.map((row) => [...row].sort((a, b) => a.x - b.x))
}

/** buildViewRowsText 的选项 */
export interface ViewRowsTextOptions {
  /** 单元格带 [nodeId] 前缀（模型直接引用其它工具需要 id） */
  includeIds: boolean
  /** 单元格带 [x,y] 坐标前缀 */
  includeCoordinates: boolean
  /** 最多编入的节点数（超出截断） */
  maxNodes: number
}

/** buildViewRowsText 的结果 */
export interface ViewRowsTextResult {
  /** 行索引 → 该行节点 id 列表（结构化定位，模型无需解析文本） */
  rows: Array<{ index: number; nodeIds: string[] }>
  /** 行间 '\n'、行内 ' | ' 的格式化文本 */
  text: string
  /** 因 maxNodes 截断而丢弃了节点 */
  truncated: boolean
}

/** 单元格文本：可选 [nodeId] / [x,y] 前缀 + 首行文本 */
function formatCell(node: McpViewNode, opts: ViewRowsTextOptions): string {
  const label = firstLine(node.text)
  const parts: string[] = []
  if (opts.includeIds) parts.push(`[${node.id}]`)
  if (opts.includeCoordinates) parts.push(`[${node.x},${node.y}]`)
  return parts.length > 0 ? `${parts.join(' ')} ${label}` : label
}

/** 聚行 + 格式化 + 截断（T2 aidea_view_read 的核心实现） */
export function buildViewRowsText(nodes: McpViewNode[], opts: ViewRowsTextOptions): ViewRowsTextResult {
  const rows = lineHitRows(nodes)
  const rowEntries: Array<{ index: number; nodeIds: string[] }> = []
  const lines: string[] = []
  let included = 0
  let truncated = false

  for (const row of rows) {
    if (included >= opts.maxNodes) {
      truncated = true
      break
    }
    const remaining = opts.maxNodes - included
    const take = row.slice(0, remaining)
    if (take.length < row.length) truncated = true
    included += take.length
    rowEntries.push({ index: rowEntries.length, nodeIds: take.map((n) => n.id) })
    lines.push(take.map((n) => formatCell(n, opts)).join(' | '))
  }

  return { rows: rowEntries, text: lines.join('\n'), truncated }
}
