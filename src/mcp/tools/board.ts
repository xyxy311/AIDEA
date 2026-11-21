/**
 * mcp/tools/board.ts —— 读域工具：T0 视图大纲（索引层）/ T1 整板概览 / T2 视图链式读取（内容层）/
 * T4 节点搜索 + 3 个 resource。只读：经 adapter.api 与各 store 查询，不触碰命令层（I4：不产生历史）。
 */
import { ROOT_NODE_ID, useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useViewStore } from '@/stores/view'
import { useAdditionsStore } from '@/stores/additions'
import { adapter } from '@/plugin/adapter'
import { buildViewRowsText, type McpViewNode } from '../viewText'
import { decomposeChains, buildViewChainText, type ChainEdge, type ChainNode } from '../chainText'
import { buildOutline, type OutlineEntry } from '../outlineText'
import { displayLabel, normalizeHex, presetNameOf } from '../naming'
import {
  MCP_DEFAULT_CONN_STYLE,
  MCP_LAYOUT_MAX_NODES,
  MCP_CHAIN_DEFAULT_MAX_CHAINS,
  MCP_CHAIN_DEFAULT_UNLINKED_LIMIT,
  MCP_CHAIN_LABEL_MAX,
  MCP_CHAIN_MAX_CHAINS_CAP,
  MCP_LIMITS,
  MCP_OUTLINE_DEFAULT_DEPTH,
  MCP_OUTLINE_DEFAULT_LIMIT,
  MCP_OUTLINE_LEAF_PREVIEW,
  MCP_OUTLINE_MAX_DEPTH,
  MCP_OUTLINE_MAX_LIMIT,
  MCP_SEARCH_DEFAULT_LIMIT,
  MCP_SEARCH_LIMIT_CAP,
} from '../constants'
import type { Connection, ConnectionPresetStyle, WhiteboardNode } from '@/types'
import type { McpResourceDef, McpToolDef, McpToolOutput } from '../types'
import {
  ToolError,
  ancestorPath,
  clampInt,
  connectionSnapshot,
  firstLineOf,
  handleToken,
  nodeHandles,
  resolveNodeRef,
  schema,
  siblingDisplayNames,
  titlePathOf,
} from './shared'

/** 视图子节点 → lineHit 输入（includeLayout 用） */
function toViewNodes(children: WhiteboardNode[]): McpViewNode[] {
  return children.map((c) => ({ id: c.id, x: c.x, y: c.y, width: c.width, height: c.height, text: c.text }))
}

/** 连线样式是否恰为内置默认（四元组全等才省略边段样式名，§5.5） */
function isDefaultConnStyle(c: Connection): boolean {
  return (
    c.lineStyle === MCP_DEFAULT_CONN_STYLE.lineStyle &&
    c.strokeWidth === MCP_DEFAULT_CONN_STYLE.strokeWidth &&
    normalizeHex(c.strokeColor) === normalizeHex(MCP_DEFAULT_CONN_STYLE.strokeColor) &&
    c.directed === MCP_DEFAULT_CONN_STYLE.directed
  )
}

/** 连线样式 → 预设名（同值多预设标注 (=name2)）；未命中回退紧凑原始值 lineStyle#hex */
function connStyleName(c: Connection, presets: readonly ConnectionPresetStyle[]): string {
  const hits = presets.filter(
    (p) =>
      p.lineStyle === c.lineStyle &&
      p.strokeWidth === c.strokeWidth &&
      normalizeHex(p.strokeColor) === normalizeHex(c.strokeColor) &&
      p.directed === c.directed,
  )
  if (hits.length === 1) return hits[0].name
  if (hits.length > 1) return `${hits[0].name} (=${hits.slice(1).map((h) => h.name).join('=')})`
  return `${c.lineStyle}${normalizeHex(c.strokeColor)}`
}

/** T0 outline 输入条目构建（深度内展开；叶计数不受深度限制） */
function buildOutlineEntry(
  node: WhiteboardNode,
  siblingNames: Map<string, string>,
  depthLeft: number,
  ctx: {
    handles: Map<string, string>
    tagNames: Map<string, string>
    presets: ReturnType<typeof adapter.api.presets.nodePresets>
    includeTags: boolean
    includeStyles: boolean
    additionKeys: string[]
  },
): OutlineEntry {
  const nodeStore = useNodeStore()
  const children = nodeStore.childrenOf(node.id)
  const childNames = siblingDisplayNames(children)
  const leafCount = (): number => {
    let count = 0
    const stack = [...children]
    while (stack.length) {
      const cur = stack.pop()!
      const kids = nodeStore.childrenOf(cur.id)
      if (kids.length === 0) count++
      else stack.push(...kids)
    }
    return count
  }
  return {
    id: node.id,
    handle: ctx.handles.get(node.id) ?? node.id,
    label: displayLabel(node.text, { full: false, maxChars: MCP_CHAIN_LABEL_MAX, displayName: siblingNames.get(node.id) }),
    tagNames: ctx.includeTags ? (node.tagIds ?? []).map((tid) => ctx.tagNames.get(tid) ?? tid) : [],
    styleName: ctx.includeStyles ? presetNameOf(node.borderColor, ctx.presets) : null,
    additionKeys: node.parentId === null ? ctx.additionKeys : [],
    childCount: children.length,
    leafCount: leafCount(),
    children: depthLeft > 0 ? children.map((c) => buildOutlineEntry(c, childNames, depthLeft - 1, ctx)) : [],
  }
}

const outline: McpToolDef = {
  name: 'aidea_outline',
  title: 'mcp.tools.aidea_outline',
  description:
    'Tree index of the project (three-layer read model, index layer): parent/child structure with handles, tag names, style names and subtree counts; no coordinates. Start here on large boards to decide which view to read next, then drill into any subtree via rootId. Leaf nodes are only counted, except a parent whose children are ALL leaves lists up to 5 leaf names. Read-only: never creates undo history.',
  inputSchema: schema({
    type: 'object',
    properties: {
      rootId: { type: 'string', description: 'Subtree root (handle N<code>, name or full id). Omit for the project root.' },
      depth: { type: 'integer', minimum: 1, maximum: MCP_OUTLINE_MAX_DEPTH, description: 'Child levels to expand. Default 3.' },
      limit: { type: 'integer', minimum: 1, maximum: MCP_OUTLINE_MAX_LIMIT, description: 'Max output lines. Default 50.' },
      includeAdditions: { type: 'boolean', description: 'List plugin addition KEY NAMES on the root line (values are plugin-private). Default false.' },
      includeStyles: { type: 'boolean', description: 'Show node preset style names. Default true.' },
      includeTags: { type: 'boolean', description: 'Show tag names. Default true.' },
    },
    additionalProperties: false,
  }),
  risk: 'read',
  handler: (args) => {
    const nodeStore = useNodeStore()
    const root = resolveNodeRef(typeof args.rootId === 'string' && args.rootId ? args.rootId : ROOT_NODE_ID)
    const depth = clampInt(args.depth, 1, MCP_OUTLINE_MAX_DEPTH, MCP_OUTLINE_DEFAULT_DEPTH)
    const limit = clampInt(args.limit, 1, MCP_OUTLINE_MAX_LIMIT, MCP_OUTLINE_DEFAULT_LIMIT)
    const includeTags = args.includeTags !== false
    const includeStyles = args.includeStyles !== false
    const includeAdditions = args.includeAdditions === true
    const siblings = root.parentId ? nodeStore.childrenOf(root.parentId) : [root]
    const entry = buildOutlineEntry(root, siblingDisplayNames(siblings), depth, {
      handles: nodeHandles(),
      tagNames: new Map(adapter.api.tag.list().map((t) => [t.id, t.name])),
      presets: adapter.api.presets.nodePresets(),
      includeTags,
      includeStyles,
      additionKeys: includeAdditions ? useAdditionsStore().keys() : [],
    })
    const built = buildOutline(entry, {
      depth,
      limit,
      leafPreview: MCP_OUTLINE_LEAF_PREVIEW,
      titlePath: titlePathOf(root.id),
    })
    return { kind: 'text', text: built.text }
  },
}

const boardOverview: McpToolDef = {
  name: 'aidea_board_overview',
  title: 'mcp.tools.aidea_board_overview',
  description:
    'Get a one-call overview of the whole board: project name, dirty state, node stats, current view, selection (read-only info), viewport, tags and presets (with ids for later calls), and tool limits. Call this first to build a mental model before other tools.',
  inputSchema: schema({
    type: 'object',
    properties: {},
    additionalProperties: false,
  }),
  risk: 'read',
  handler: () => {
    const api = adapter.api
    const project = useProjectStore()
    const view = useViewStore('main')
    const viewedNodeId = project.currentNodeId
    return {
      kind: 'json',
      payload: {
        projectName: api.project.projectName(),
        dirty: api.file.dirty(),
        stats: api.project.stats(),
        view: {
          viewedNodeId,
          isMain: viewedNodeId === 'root',
          pathTitle: titlePathOf(viewedNodeId),
          childCount: api.node.children(viewedNodeId).length,
          connectionCount: api.connection.list(viewedNodeId).length,
        },
        selection: api.view.selection(),
        viewport: {
          x: view.stageX,
          y: view.stageY,
          scale: view.stageScale,
          gridMode: view.gridMode,
          inlineViews: view.inlineViews.map((iv) => iv.nodeId),
        },
        tags: api.tag.list().map((t) => ({ id: t.id, name: t.name, color: t.color })),
        nodePresets: api.presets.nodePresets().map((p) => ({ id: p.id, name: p.name, borderColor: p.borderColor })),
        connectionPresets: api.presets
          .connectionPresets()
          .map((p) => ({ id: p.id, name: p.name, lineStyle: p.lineStyle, strokeColor: p.strokeColor, directed: p.directed })),
        limits: MCP_LIMITS,
      },
    }
  },
}

/** T2 共用核心（handler 与 resource 复用）：链分解 + 文本渲染或 json 载荷 */
function readViewCore(viewNodeId: string, args: Record<string, unknown>): McpToolOutput {
  const nodeStore = useNodeStore()
  const children = nodeStore.childrenOf(viewNodeId)
  const handles = nodeHandles()
  const names = siblingDisplayNames(children)
  const labelMode = args.label === 'full' ? 'full' : 'first'
  const labelMax = clampInt(args.labelMax, 10, 200, MCP_CHAIN_LABEL_MAX)
  const includeCoords = args.includeCoords !== false
  const includeTags = args.includeTags !== false
  const includeStyles = args.includeStyles !== false
  const includeUnlinked = args.includeUnlinked !== false
  const unlinkedLimit = clampInt(args.unlinkedLimit, 1, 200, MCP_CHAIN_DEFAULT_UNLINKED_LIMIT)
  const maxChains = clampInt(args.maxChains, 1, MCP_CHAIN_MAX_CHAINS_CAP, MCP_CHAIN_DEFAULT_MAX_CHAINS)
  const after = clampInt(args.after, 0, Number.MAX_SAFE_INTEGER, 0)
  const filter = typeof args.filter === 'string' && args.filter ? args.filter : undefined

  const tagNames = new Map(adapter.api.tag.list().map((t) => [t.id, t.name]))
  const nodePresets = adapter.api.presets.nodePresets()
  const connPresets = adapter.api.presets.connectionPresets()

  const toChainNode = (n: WhiteboardNode): ChainNode => ({
    id: n.id,
    handle: handles.get(n.id) ?? n.id,
    label: displayLabel(n.text, { full: labelMode === 'full', maxChars: labelMax, displayName: names.get(n.id) }),
    tagNames: includeTags ? (n.tagIds ?? []).map((tid) => tagNames.get(tid) ?? tid) : [],
    styleName: includeStyles ? presetNameOf(n.borderColor, nodePresets) : null,
    x: n.x,
    y: n.y,
    childCount: nodeStore.childrenOf(n.id).length,
  })

  const conns = nodeStore.getConnections(viewNodeId)
  const edges: ChainEdge[] = conns.map((c, i) => ({
    index: i + 1,
    fromId: c.fromNodeId,
    toId: c.toNodeId,
    directed: c.directed,
    text: c.text,
    styleName: isDefaultConnStyle(c) ? null : connStyleName(c, connPresets),
  }))

  const chainNodes = children.map(toChainNode)
  const { chains, unlinked } = decomposeChains(chainNodes, edges)

  if (args.format === 'json') {
    return {
      kind: 'json',
      payload: {
        viewedNodeId: viewNodeId,
        handle: handleToken(handles, viewNodeId),
        titlePath: titlePathOf(viewNodeId),
        childCount: children.length,
        connectionCount: conns.length,
        nodes: children.map((n) => ({
          nodeId: n.id,
          handle: handleToken(handles, n.id),
          displayName: names.get(n.id) ?? '',
          label: displayLabel(n.text, { full: labelMode === 'full', maxChars: labelMax, displayName: names.get(n.id) }),
          x: Math.round(n.x),
          y: Math.round(n.y),
          childCount: nodeStore.childrenOf(n.id).length,
          tagIds: [...(n.tagIds ?? [])],
          borderColor: n.borderColor,
        })),
        connections: conns.map((c, i) => ({ index: i + 1, ...connectionSnapshot(c) })),
        chains: chains.map((ch) => ({
          nodes: ch.nodes.map((n) => n.id),
          edges: ch.edges.map((e) => e.index),
          closedToId: ch.closedToId,
          endsAtBranch: ch.endsAtBranch,
        })),
        unlinked: unlinked.map((n) => n.id),
      },
    }
  }

  const styleDict = nodePresets.map((p) => `${p.name}=${normalizeHex(p.borderColor)}`).join(' | ')
  const linkDict = connPresets
    .map((p) => `${p.name}=${p.lineStyle}${normalizeHex(p.strokeColor)} ${p.directed ? '单向' : '双向'}`)
    .join(' | ')
  const tagDict = adapter.api.tag.list().map((t) => t.name).join(' | ')
  const built = buildViewChainText(
    {
      titlePath: titlePathOf(viewNodeId),
      childCount: children.length,
      connectionCount: conns.length,
      chains,
      unlinked,
      styleDict,
      linkDict,
      tagDict,
    },
    { includeCoords, includeTags, includeStyles, includeUnlinked, unlinkedLimit, maxChains, after, filter },
  )
  let text = built.text
  if (args.includeLayout === true) {
    const rows = buildViewRowsText(toViewNodes(children), { includeIds: true, includeCoordinates: false, maxNodes: MCP_LAYOUT_MAX_NODES })
    text += `\n\nLAYOUT (line-hit rows)\n${rows.text}`
  }
  return { kind: 'text', text }
}

const viewRead: McpToolDef = {
  name: 'aidea_view_read',
  title: 'mcp.tools.aidea_view_read',
  description:
    'Read one view as chain text (three-layer read model, content layer). Connections render as readable chains "--C<n> text | style-->" between cells "[Nhandle name (+K) | tags | style | @x,y]"; a node repeats as "[name]" after its first cell. Style slots are omitted when equal to the built-in default. Rings are NOT marked inline — infer them by cross-referencing chains that share start/end cells. Edges are traversed in stored from->to order even when directed=false ("--" affects display only). Handles "N<code>" are globally unique and the preferred way to address nodes in write tools; C<n> is the 1-based index into THIS view\'s connection list (re-read after deleting connections). Prefer aidea_outline first on large boards. format:"json" returns complete structured data (no pagination/filter). Read-only: never creates undo history.',
  inputSchema: schema({
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'View container node (handle N<code>, name or full id). Omit for the current view.' },
      label: { type: 'string', enum: ['first', 'full'], description: '"first" = first line plus "(+K lines)" marker (default); "full" = whole text with \\n escaped.' },
      labelMax: { type: 'integer', minimum: 10, maximum: 200, description: 'Truncate labels beyond this many chars (adds …). Default 40.' },
      includeCoords: { type: 'boolean', description: 'Integer @x,y in cells. Default true.' },
      includeTags: { type: 'boolean', description: 'Tag names in cells. Default true.' },
      includeStyles: { type: 'boolean', description: 'Preset style names in cells/edges. Default true.' },
      includeUnlinked: { type: 'boolean', description: 'UNLINKED section. Default true.' },
      unlinkedLimit: { type: 'integer', minimum: 1, maximum: 200, description: 'Fold UNLINKED beyond this count. Default 20.' },
      filter: { type: 'string', description: 'Case-insensitive name substring: keep matching chains with 1 hop of context around each match, plus matching unlinked nodes.' },
      maxChains: { type: 'integer', minimum: 1, maximum: MCP_CHAIN_MAX_CHAINS_CAP, description: 'Max chain lines per page. Default 40.' },
      after: { type: 'integer', minimum: 0, description: 'Chain list offset (pass nextAfter from a truncated response). Default 0.' },
      includeLayout: { type: 'boolean', description: 'Append the legacy line-hit row-band section. Default false.' },
      format: { type: 'string', enum: ['text', 'json'], description: '"text" (default) chain text; "json" precise escape hatch.' },
    },
    additionalProperties: false,
  }),
  risk: 'read',
  handler: (args) => {
    const project = useProjectStore()
    const viewNode = resolveNodeRef(typeof args.nodeId === 'string' && args.nodeId ? args.nodeId : project.currentNodeId)
    return readViewCore(viewNode.id, args)
  },
}

const nodeSearch: McpToolDef = {
  name: 'aidea_node_search',
  title: 'mcp.tools.aidea_node_search',
  description:
    'Search nodes by query. scope: "text" (default, case-insensitive substring over full text), "tag" (tag name), "reference" (#reference name), or "all" (union). Returns matches with node id, first line, ancestor path and the matched text.',
  inputSchema: schema({
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1, description: 'Search query (case-insensitive substring).' },
      scope: { type: 'string', enum: ['all', 'text', 'tag', 'reference'], description: 'Default "all".' },
      limit: { type: 'integer', minimum: 1, maximum: MCP_SEARCH_LIMIT_CAP, description: 'Default 50.' },
    },
    required: ['query'],
    additionalProperties: false,
  }),
  risk: 'read',
  handler: (args) => {
    const query = String(args.query)
    const scope = typeof args.scope === 'string' ? args.scope : 'all'
    const limit = typeof args.limit === 'number' ? args.limit : MCP_SEARCH_DEFAULT_LIMIT
    const nodeStore = useNodeStore()
    const q = query.toLowerCase()
    const byId = new Map<string, { nodeId: string; firstLine: string; path: string; matched: string }>()

    const add = (nodeId: string, matched: string): void => {
      if (byId.has(nodeId)) return
      const n = nodeStore.getNode(nodeId)
      if (!n) return
      byId.set(nodeId, { nodeId, firstLine: firstLineOf(n.text), path: ancestorPath(nodeId), matched })
    }

    if (scope === 'all' || scope === 'text') {
      for (const node of nodeStore.nodes.values()) {
        if (node.parentId === null) continue
        const line = node.text.split('\n').find((l) => l.toLowerCase().includes(q))
        if (line !== undefined) add(node.id, line.trim())
      }
    }
    if (scope === 'all' || scope === 'tag') {
      for (const tag of adapter.api.tag.list()) {
        if (!tag.name.toLowerCase().includes(q)) continue
        for (const nodeId of nodeStore.nodesWithTag(tag.id)) add(nodeId, tag.name)
      }
    }
    if (scope === 'all' || scope === 'reference') {
      for (const ref of nodeStore.referenceableNodes()) {
        if (!ref.name.toLowerCase().includes(q)) continue
        add(ref.nodeId, `#${ref.name}`)
      }
    }

    const matches = [...byId.values()]
    return {
      kind: 'json',
      payload: { matches: matches.slice(0, limit), total: matches.length },
    }
  },
}

/** 三个 resource：项目序列化 / 当前视图文本 / 标签字典（同步按需生成） */
export const BOARD_RESOURCES: McpResourceDef[] = [
  {
    uri: 'aidea://project/current',
    name: 'Current project (serialized)',
    description: 'Full serialized project JSON (same shape as the saved .aidea.json file).',
    mimeType: 'application/json',
    read: () => ({ mimeType: 'application/json', text: adapter.api.file.serializeCurrent() }),
  },
  {
    uri: 'aidea://view/current',
    name: 'Current view as chain text',
    description: 'Chain text of the current main view (same as aidea_view_read defaults).',
    mimeType: 'text/markdown',
    read: () => {
      const project = useProjectStore()
      const out = readViewCore(project.currentNodeId, {})
      if (out.kind !== 'text') throw new ToolError('unexpected view read result')
      return { mimeType: 'text/markdown', text: out.text }
    },
  },
  {
    uri: 'aidea://board/tags',
    name: 'Tag dictionary',
    description: 'All tag definitions with per-tag node counts (for client-side caching).',
    mimeType: 'application/json',
    read: () => {
      const nodeStore = useNodeStore()
      const tags = adapter.api.tag.list().map((t) => ({ id: t.id, name: t.name, color: t.color, nodeCount: nodeStore.nodesWithTag(t.id).length }))
      return { mimeType: 'application/json', text: JSON.stringify({ tags }) }
    },
  },
]

export const BOARD_TOOLS: McpToolDef[] = [outline, boardOverview, viewRead, nodeSearch]
