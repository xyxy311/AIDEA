/**
 * mcp/tools/board.ts —— 读域工具：T1 整板概览 / T2 视图读取 / T4 节点搜索 + 3 个 resource。
 * 只读：经 adapter.api 与各 store 查询，不触碰命令层。
 */
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useViewStore } from '@/stores/view'
import { adapter } from '@/plugin/adapter'
import { buildViewRowsText, type McpViewNode } from '../viewText'
import { MCP_LIMITS, MCP_SEARCH_DEFAULT_LIMIT, MCP_SEARCH_LIMIT_CAP, MCP_VIEW_READ_DEFAULT_MAX_NODES, MCP_VIEW_READ_MAX_NODES_CAP } from '../constants'
import type { McpResourceDef, McpToolDef, McpToolOutput } from '../types'
import { ToolError, ancestorPath, firstLineOf, nodeSnapshot, requireNode, schema, titlePathOf } from './shared'
import type { Connection } from '@/types'

/** 视图子节点 → lineHit 输入 */
function toViewNodes(children: ReturnType<ReturnType<typeof useNodeStore>['childrenOf']>): McpViewNode[] {
  return children.map((c) => ({ id: c.id, x: c.x, y: c.y, width: c.width, height: c.height, text: c.text }))
}

/** 连线结构化快照（T2/T3 共用形状） */
export function connectionSnapshot(c: Connection): { id: string; fromNodeId: string; toNodeId: string; text: string | null } {
  return { id: c.id, fromNodeId: c.fromNodeId, toNodeId: c.toNodeId, text: c.text }
}

/** T2 共用实现（resource aidea://view/current 复用） */
export function readView(
  viewNodeId: string,
  opts: { includeIds: boolean; includeCoordinates: boolean; maxNodes: number },
): McpToolOutput {
  const nodeStore = useNodeStore()
  requireNode(viewNodeId)
  const children = nodeStore.childrenOf(viewNodeId)
  const built = buildViewRowsText(toViewNodes(children), opts)
  return {
    kind: 'json',
    payload: {
      viewedNodeId: viewNodeId,
      titlePath: titlePathOf(viewNodeId),
      text: built.text,
      rows: built.rows,
      nodes: children.map(nodeSnapshot),
      connections: nodeStore.getConnections(viewNodeId).map(connectionSnapshot),
      nodeCount: children.length,
      truncated: built.truncated,
    },
  }
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

const viewRead: McpToolDef = {
  name: 'aidea_view_read',
  title: 'mcp.tools.aidea_view_read',
  description:
    'Read one view as structured text: rows of nodes arranged by a line-hit spatial algorithm (rows separated by \\n, cells by " | "). Cells carry "[nodeId] firstLine" so you can reference ids directly; also returns structured rows/nodes/connections so you never need to parse the text. Defaults to the current view; pass nodeId to read another node\'s child view.',
  inputSchema: schema({
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'View node id (its direct children are listed). Omit for the current view.' },
      includeIds: { type: 'boolean', description: 'Prefix cells with [nodeId]. Default true.' },
      includeCoordinates: { type: 'boolean', description: 'Prefix cells with [x,y]. Default false.' },
      maxNodes: { type: 'integer', minimum: 1, maximum: MCP_VIEW_READ_MAX_NODES_CAP, description: 'Max nodes encoded into text. Default 300.' },
    },
    additionalProperties: false,
  }),
  risk: 'read',
  handler: (args) => {
    const project = useProjectStore()
    const viewNodeId = typeof args.nodeId === 'string' && args.nodeId ? args.nodeId : project.currentNodeId
    const opts = {
      includeIds: args.includeIds !== false,
      includeCoordinates: args.includeCoordinates === true,
      maxNodes: typeof args.maxNodes === 'number' ? args.maxNodes : MCP_VIEW_READ_DEFAULT_MAX_NODES,
    }
    return readView(viewNodeId, opts)
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
    name: 'Current view as text',
    description: 'Structured text of the current main view (same as aidea_view_read defaults).',
    mimeType: 'text/markdown',
    read: () => {
      const project = useProjectStore()
      const out = readView(project.currentNodeId, { includeIds: true, includeCoordinates: false, maxNodes: MCP_VIEW_READ_DEFAULT_MAX_NODES })
      if (out.kind !== 'json') throw new ToolError('unexpected screenshot result')
      return { mimeType: 'text/markdown', text: (out.payload as { text: string }).text }
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

export const BOARD_TOOLS: McpToolDef[] = [boardOverview, viewRead, nodeSearch]
