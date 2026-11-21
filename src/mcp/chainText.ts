/**
 * mcp/chainText.ts —— MCP 读侧链式视图文本（零依赖纯函数，沿用 viewText.ts 的隔离风格）。
 * 链分解（两遍起点 + 未消费出边 + 分支点断链，§5.1）/ 节点 cell（D0/D2）/ 边段（D4/D5）/ 整体版式（§4.3）。
 */

/** 链式渲染的节点（label/tagNames/styleName 由调用方按读参数预计算） */
export interface ChainNode {
  id: string
  /** 短句柄码（不含 'N' 前缀） */
  handle: string
  /** 渲染用显示名（含同名 (n) 后缀与 labelMax 截断） */
  label: string
  tagNames: string[]
  /** 预设名或紧凑原始值；null = 内置默认样式（边段省略样式槽） */
  styleName: string | null
  x: number
  y: number
  /** 子节点数（>0 时 cell 追加 (+K) 子视图标记） */
  childCount: number
}

/** 链式渲染的边段（index = 父连线表 1-based 下标 → C<n>） */
export interface ChainEdge {
  index: number
  fromId: string
  toId: string
  directed: boolean
  text: string | null
  /** 预设名或紧凑原始值；null = 内置默认样式（省略） */
  styleName: string | null
}

export interface Chain {
  nodes: ChainNode[]
  edges: ChainEdge[]
  /** 环闭合：链走回链内已有节点时为其 id（渲染为 ↩回[label]，不再追加节点） */
  closedToId: string | null
  /** 分支点断链：链尾节点有 ≥2 条未消费出边 */
  endsAtBranch: boolean
}

/**
 * 链分解（§5.1 三要素：两遍起点 + "未消费出边"语义 + 分支点断链，缺一即丢边）：
 * - pass1：入度 0 的节点，每条未消费出边各起一条链；
 * - pass2：按节点顺序扫描，仍有未消费出边的节点，每条未消费出边各起一条链（自然进入环）；
 * - 步进沿存储 from→to（不看 directed）；到 ≥2 条未消费出边的节点即断链，其余出边由 pass2 接管。
 * 端点不在 nodes 内的边跳过（数据不变式下不发生）。
 */
export function decomposeChains(
  nodes: readonly ChainNode[],
  edges: readonly ChainEdge[],
): { chains: Chain[]; unlinked: ChainNode[] } {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const out = new Map<string, ChainEdge[]>()
  const indeg = new Map<string, number>()
  const validEdges: ChainEdge[] = []
  for (const e of edges) {
    if (!nodeById.has(e.fromId) || !nodeById.has(e.toId)) continue
    validEdges.push(e)
    const arr = out.get(e.fromId)
    if (arr) arr.push(e)
    else out.set(e.fromId, [e])
    indeg.set(e.toId, (indeg.get(e.toId) ?? 0) + 1)
  }
  const consumed = new Set<ChainEdge>()

  // 两遍起点收集：pass1 入度 0；pass2 按节点顺序（重复扫描保证"未消费出边"语义）
  const starts: ChainEdge[] = []
  for (const n of nodes) {
    if ((indeg.get(n.id) ?? 0) !== 0) continue
    for (const e of out.get(n.id) ?? []) starts.push(e)
  }
  for (const n of nodes) {
    for (const e of out.get(n.id) ?? []) starts.push(e)
  }

  const chains: Chain[] = []
  for (const start of starts) {
    if (consumed.has(start)) continue
    const first = nodeById.get(start.fromId)
    if (!first) continue
    const chain: Chain = { nodes: [first], edges: [], closedToId: null, endsAtBranch: false }
    const inChain = new Set<string>([first.id])
    let edge = start
    for (;;) {
      consumed.add(edge)
      chain.edges.push(edge)
      const to = nodeById.get(edge.toId)!
      if (inChain.has(to.id)) {
        chain.closedToId = to.id
        break
      }
      chain.nodes.push(to)
      inChain.add(to.id)
      const next = (out.get(to.id) ?? []).filter((e) => !consumed.has(e))
      if (next.length === 0) break
      if (next.length >= 2) {
        chain.endsAtBranch = true
        break
      }
      edge = next[0]
    }
    chains.push(chain)
  }

  // 排序：链长降序 → 链首 (y,x) → 链首句柄（稳定排序保证完全并列时保持生成序，I3 确定性）
  chains.sort((a, b) => {
    if (b.nodes.length !== a.nodes.length) return b.nodes.length - a.nodes.length
    const ha = a.nodes[0]
    const hb = b.nodes[0]
    if (ha.y !== hb.y) return ha.y - hb.y
    if (ha.x !== hb.x) return ha.x - hb.x
    if (ha.handle !== hb.handle) return ha.handle < hb.handle ? -1 : 1
    return 0
  })

  const linked = new Set<string>()
  for (const e of validEdges) {
    linked.add(e.fromId)
    linked.add(e.toId)
  }
  const unlinked = nodes
    .filter((n) => !linked.has(n.id))
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x !== b.x ? a.x - b.x : a.handle < b.handle ? -1 : 1))

  return { chains, unlinked }
}

export interface CellOpts {
  /** 已以全量 cell 出现过的节点 id（跨链共享，同一次输出内生效） */
  seen: Set<string>
  includeCoords: boolean
  includeTags: boolean
  includeStyles: boolean
}

/** 节点 cell（D0-a/D2）：首次出现全量 [N句柄 名 (+K) | 标签 | 样式 | @x,y]，再次出现短式 [名] */
export function renderCell(node: ChainNode, opts: CellOpts): string {
  if (opts.seen.has(node.id)) return `[${node.label}]`
  opts.seen.add(node.id)
  const slots: string[] = []
  if (opts.includeTags && node.tagNames.length > 0) slots.push(node.tagNames.join('+'))
  if (opts.includeStyles && node.styleName) slots.push(node.styleName)
  if (opts.includeCoords) slots.push(`@${Math.round(node.x)},${Math.round(node.y)}`)
  const sub = node.childCount > 0 ? ` (+${node.childCount})` : ''
  const body = slots.length > 0 ? ` | ${slots.join(' | ')}` : ''
  return `[N${node.handle} ${node.label}${sub}${body}]`
}

/** 边段四态（D5 固定槽位次序）：'--C12-->' | '--C12 文字-->' | '--C12 | 样式-->' | '--C12 文字 | 样式-->' */
export function renderEdge(edge: ChainEdge, opts: { includeStyles: boolean }): string {
  let s = `--C${edge.index}`
  if (edge.text) s += ` ${edge.text}`
  if (opts.includeStyles && edge.styleName) s += ` | ${edge.styleName}`
  return s + (edge.directed ? '-->' : '--')
}

export interface ViewChainInput {
  titlePath: string
  childCount: number
  connectionCount: number
  chains: Chain[]
  unlinked: ChainNode[]
  /** 预渲染字典行（D7：随响应内联） */
  styleDict: string
  linkDict: string
  tagDict: string
}

export interface ViewChainOpts {
  includeCoords: boolean
  includeTags: boolean
  includeStyles: boolean
  includeUnlinked?: boolean
  unlinkedLimit: number
  maxChains: number
  /** 链列表分页偏移（truncated 响应的 nextAfter 回传） */
  after?: number
  /** 名称子串过滤：命中链保留命中节点前后各 1 跳；未连线节点按名匹配 */
  filter?: string
}

/** 渲染一条链（可选按 keep 下标集合过滤为若干连续段，段间以 ' ⋯ ' 相接） */
function renderChainLine(
  chain: Chain,
  keep: Set<number> | null,
  cellOpts: CellOpts,
  edgeOpts: { includeStyles: boolean },
  nodeById: Map<string, ChainNode>,
): string {
  const closing = (): string => {
    if (!chain.closedToId) return ''
    const closed = nodeById.get(chain.closedToId)
    return renderEdge(chain.edges[chain.edges.length - 1], edgeOpts) + `↩回[${closed?.label ?? chain.closedToId}]`
  }
  if (!keep) {
    let s = renderCell(chain.nodes[0], cellOpts)
    for (let i = 1; i < chain.nodes.length; i++) {
      s += renderEdge(chain.edges[i - 1], edgeOpts) + renderCell(chain.nodes[i], cellOpts)
    }
    return s + closing()
  }
  const idxs = [...keep].sort((a, b) => a - b)
  const runs: number[][] = []
  for (const i of idxs) {
    const last = runs[runs.length - 1]
    if (last && i === last[last.length - 1] + 1) last.push(i)
    else runs.push([i])
  }
  return runs
    .map((run) => {
      let s = renderCell(chain.nodes[run[0]], cellOpts)
      for (let k = 1; k < run.length; k++) {
        s += renderEdge(chain.edges[run[k] - 1], edgeOpts) + renderCell(chain.nodes[run[k]], cellOpts)
      }
      if (chain.closedToId && run[run.length - 1] === chain.nodes.length - 1) s += closing()
      return s
    })
    .join(' ⋯ ')
}

/**
 * 整体版式（§4.3）：头两行 + CHAINS（分页/过滤）+ UNLINKED（折叠）+ STYLE/LINK/TAGS 字典。
 * truncated 时文本内附翻页提示，nextAfter 回传给 after 参数。
 */
export function buildViewChainText(
  input: ViewChainInput,
  opts: ViewChainOpts,
): { text: string; truncated: boolean; nextAfter: number | null } {
  const nodeById = new Map<string, ChainNode>()
  for (const c of input.chains) for (const n of c.nodes) nodeById.set(n.id, n)
  for (const n of input.unlinked) nodeById.set(n.id, n)

  const cellOpts: CellOpts = {
    seen: new Set(),
    includeCoords: opts.includeCoords,
    includeTags: opts.includeTags,
    includeStyles: opts.includeStyles,
  }
  const edgeOpts = { includeStyles: opts.includeStyles }

  // 过滤：命中节点前后各留 1 跳（不是整链）
  let visible = input.chains
  let keeps: Array<Set<number> | null> = input.chains.map(() => null)
  if (opts.filter) {
    const q = opts.filter.toLowerCase()
    const matchIds = new Set<string>()
    for (const n of nodeById.values()) {
      if (n.label.toLowerCase().includes(q)) matchIds.add(n.id)
    }
    keeps = []
    visible = []
    for (const chain of input.chains) {
      const keep = new Set<number>()
      chain.nodes.forEach((n, i) => {
        if (!matchIds.has(n.id)) return
        if (i > 0) keep.add(i - 1)
        keep.add(i)
        if (i < chain.nodes.length - 1) keep.add(i + 1)
      })
      if (keep.size === 0) continue
      keeps.push(keep)
      visible.push(chain)
    }
  }

  const after = Math.max(0, opts.after ?? 0)
  const pageIdx: number[] = []
  for (let i = after; i < visible.length && pageIdx.length < opts.maxChains; i++) pageIdx.push(i)
  const chainsTruncated = visible.length > after + pageIdx.length
  const nextAfter = chainsTruncated ? after + pageIdx.length : null

  const lines: string[] = []
  lines.push(
    `VIEW ${input.titlePath}  ${input.childCount} 子节点 · ${input.connectionCount} 连线 · 链 ${input.chains.length} · 未连线 ${input.unlinked.length}`,
  )
  lines.push('N<code>=节点句柄（可直接传给写工具） · +K = 有 K 个子视图 · @x,y = 整数左上角')
  lines.push('边段：--C<n> 文字 | 样式-->（按位置读；C 编号 = 该连线在父连线表中的序号）')
  lines.push('')
  lines.push('CHAINS')
  if (pageIdx.length === 0) {
    lines.push(opts.filter ? '(无匹配链)' : '(无连线)')
  } else {
    for (const i of pageIdx) lines.push(renderChainLine(visible[i], keeps[i], cellOpts, edgeOpts, nodeById))
  }
  if (chainsTruncated) {
    lines.push(`… (+${visible.length - after - pageIdx.length} 条链未显示；传 after=${nextAfter} 翻页)`)
  }

  if (opts.includeUnlinked !== false) {
    lines.push('UNLINKED')
    if (input.unlinked.length === 0) {
      lines.push('(无)')
    } else {
      const shown = input.unlinked.slice(0, opts.unlinkedLimit)
      for (const n of shown) lines.push(renderCell(n, cellOpts))
      if (input.unlinked.length > shown.length) {
        lines.push(`…(+${input.unlinked.length - shown.length} 未连线节点)`)
      }
    }
  }

  const pad = (label: string): string => label.padEnd(5, ' ')
  lines.push(`${pad('STYLE')} ${input.styleDict}`)
  lines.push(`${pad('LINK')}  ${input.linkDict}`)
  lines.push(`${pad('TAGS')}  ${input.tagDict}`)

  return { text: lines.join('\n'), truncated: chainsTruncated, nextAfter }
}
