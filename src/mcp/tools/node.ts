/**
 * mcp/tools/node.ts —— 节点读 + 写域工具：T3 节点详情 / T5 建节点 / T6 改文本 / T7 删除 /
 * T8 移动 / T9 排布 / T10 迁移 / T11 组合。
 * 写全部经 useCommands（可撤销）；多步写以 beginBatch/commitBatch 合并为单条历史（D5），
 * 例外：aidea_batch 事务内（ctx.inBatch）跳过自身 batch 边界。
 */
import { useNodeStore } from '@/stores/node'
import { useCommands } from '@/composables/useCommands'
import { adapter } from '@/plugin/adapter'
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from '@/constants'
import { MCP_LAYOUT_GAP, MCP_LIMITS } from '../constants'
import type { McpToolDef } from '../types'
import {
  ToolError,
  connectionSnapshot,
  handleToken,
  nodeHandles,
  nodeSnapshot,
  resolveNodeRef,
  resolvePresetColor,
  schema,
  siblingDisplayNames,
  uniqueNameOf,
} from './shared'
import type { WhiteboardNode } from '@/types'

/** 现有子节点包围盒（无子节点返回 null） */
function childrenBbox(children: WhiteboardNode[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (children.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of children) {
    minX = Math.min(minX, c.x)
    minY = Math.min(minY, c.y)
    maxX = Math.max(maxX, c.x + c.width)
    maxY = Math.max(maxY, c.y + c.height)
  }
  return { minX, minY, maxX, maxY }
}

/** 新建节点布局基准点：startAt 优先；否则现有子节点包围盒下方；再否则原点 */
function layoutBase(
  children: WhiteboardNode[],
  startAt: { x: number; y: number } | undefined,
  gap: number,
): { x: number; y: number } {
  if (startAt) return startAt
  const bbox = childrenBbox(children)
  if (!bbox) return { x: 0, y: 0 }
  return { x: bbox.minX, y: bbox.maxY + gap }
}

/** 在 base 上按布局计算每个新节点的左上角坐标 */
function layoutPositions(
  base: { x: number; y: number },
  count: number,
  layout: 'auto' | 'grid' | 'row',
  gap: number,
): Array<{ x: number; y: number }> {
  const cols = layout === 'row' || layout === 'auto' ? count : Math.ceil(Math.sqrt(count))
  const positions: Array<{ x: number; y: number }> = []
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    positions.push({
      x: base.x + col * (DEFAULT_NODE_WIDTH + gap),
      y: base.y + row * (DEFAULT_NODE_HEIGHT + gap),
    })
  }
  return positions
}

const nodeGet: McpToolDef = {
  name: 'aidea_node_get',
  title: 'mcp.tools.aidea_node_get',
  description:
    'Get one node in detail (three-layer read model, detail layer): full node fields with integer geometry, parent id, handle and unique display name, path to root (first lines), children snapshots, sibling connections, tag ids and reference name. nodeId accepts a handle N<code>, unique name or full id.',
  inputSchema: schema({
    type: 'object',
    properties: {
      nodeId: { type: 'string', minLength: 1, description: 'Node ref: handle N<code>, unique name or full id.' },
    },
    required: ['nodeId'],
    additionalProperties: false,
  }),
  risk: 'read',
  handler: (args) => {
    const nodeStore = useNodeStore()
    const n = resolveNodeRef(String(args.nodeId))
    const handles = nodeHandles()
    const kids = nodeStore.childrenOf(n.id)
    const kidNames = siblingDisplayNames(kids)
    const parent = n.parentId ? nodeStore.getNode(n.parentId) : null
    return {
      kind: 'json',
      payload: {
        node: {
          id: n.id,
          handle: handleToken(handles, n.id),
          displayName: uniqueNameOf(n),
          parentId: n.parentId,
          x: Math.round(n.x),
          y: Math.round(n.y),
          width: Math.round(n.width),
          height: Math.round(n.height),
          text: n.text,
          borderColor: n.borderColor,
          tagIds: [...n.tagIds],
        },
        parentId: n.parentId,
        pathToRoot: nodeStore
          .pathToRoot(n.id)
          .reverse()
          .map((id) => nodeStore.getNode(id)?.text.split('\n')[0]?.trim() ?? ''),
        children: kids.map((k) => nodeSnapshot(k, { handle: handleToken(handles, k.id), displayName: kidNames.get(k.id) })),
        connections: (parent?.connections ?? []).map(connectionSnapshot),
        tagIds: [...n.tagIds],
        referenceName: nodeStore.referenceableNodes().find((r) => r.nodeId === n.id)?.name ?? null,
      },
    }
  },
}

const nodeCreate: McpToolDef = {
  name: 'aidea_node_create',
  title: 'mcp.tools.aidea_node_create',
  description:
    'Create one or more child nodes under a parent. layout: "auto" (a row below the existing children bounding box), "grid" (ceil(sqrt(n)) columns) or "row"; or pass startAt {x,y} for an explicit top-left origin. Undoable as ONE history entry (revert with aidea_history). Destructive-ish: only call when the user asked for new content.',
  inputSchema: schema({
    type: 'object',
    properties: {
      parentId: { type: 'string', minLength: 1, description: 'Parent node ref (handle N<code>, name or id).' },
      texts: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: MCP_LIMITS.maxNodesPerCreate, description: 'One entry per node (multi-line allowed via \\n).' },
      layout: { type: 'string', enum: ['auto', 'grid', 'row'], description: 'Default "auto".' },
      gap: { type: 'number', minimum: 0, maximum: 500, description: 'Spacing between created nodes. Default 24.' },
      startAt: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        required: ['x', 'y'],
        additionalProperties: false,
        description: 'Explicit origin overriding auto placement.',
      },
      borderColor: { type: 'string', description: 'Node border color: hex (e.g. "#d1d5db") or a node preset name (e.g. "Blue"). Optional.' },
      preset: { type: 'string', description: 'Node preset name applied to borderColor (alias of passing the name in borderColor). Optional.' },
    },
    required: ['parentId', 'texts'],
    additionalProperties: false,
  }),
  risk: 'write',
  handler: (args, ctx) => {
    const nodeStore = useNodeStore()
    const parent = resolveNodeRef(String(args.parentId))
    const parentId = parent.id
    const texts = args.texts as string[]
    if (texts.length > MCP_LIMITS.maxNodesPerCreate) {
      throw new ToolError(`too many nodes: ${texts.length} > maxNodesPerCreate ${MCP_LIMITS.maxNodesPerCreate}`)
    }
    const layout = (typeof args.layout === 'string' ? args.layout : 'auto') as 'auto' | 'grid' | 'row'
    const gap = typeof args.gap === 'number' ? args.gap : MCP_LAYOUT_GAP
    // 预设名 → 色（D3）；borderColor 显式传入时优先
    const presetColor = typeof args.preset === 'string' ? resolvePresetColor(args.preset) : undefined
    const borderColor =
      typeof args.borderColor === 'string' ? resolvePresetColor(args.borderColor) : presetColor
    const base = layoutBase(nodeStore.childrenOf(parentId), args.startAt as { x: number; y: number } | undefined, gap)
    const positions = layoutPositions(base, texts.length, layout, gap)

    const commands = useCommands()
    // createNode 直调（adapter.api.node.create 不透传 borderColor）；默认预设样式仍由命令层取
    const create = (): string[] =>
      texts.map((text, i) => commands.createNode(parentId, positions[i].x, positions[i].y, text, { borderColor }))

    if (ctx.inBatch) return { kind: 'json', payload: { createdIds: create() } }
    commands.beginBatch()
    try {
      const createdIds = create()
      commands.commitBatch()
      return { kind: 'json', payload: { createdIds } }
    } catch (err) {
      commands.rollbackBatch()
      throw err
    }
  },
}

const nodeSetText: McpToolDef = {
  name: 'aidea_node_set_text',
  title: 'mcp.tools.aidea_node_set_text',
  description:
    'Set the full text of one or more nodes (multi-line allowed). Reference-name conflicts (#name taken by another node) are reported in conflicts and skipped, not fatal. Undoable as ONE history entry.',
  inputSchema: schema({
    type: 'object',
    properties: {
      updates: {
        type: 'array',
        minItems: 1,
        maxItems: MCP_LIMITS.maxNodesPerCreate,
        items: {
          type: 'object',
          properties: { nodeId: { type: 'string', minLength: 1 }, text: { type: 'string' } },
          required: ['nodeId', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['updates'],
    additionalProperties: false,
  }),
  risk: 'write',
  handler: (args, ctx) => {
    const updates = args.updates as Array<{ nodeId: string; text: string }>
    const api = useCommands()
    const run = (): { applied: number; conflicts: Array<{ nodeId: string; conflictRef: string }> } => {
      let applied = 0
      const conflicts: Array<{ nodeId: string; conflictRef: string }> = []
      for (const u of updates) {
        // 引用解析失败不致命：记入 conflicts（与引用名冲突同通道）
        let target: WhiteboardNode | null = null
        try {
          target = resolveNodeRef(u.nodeId)
        } catch {
          target = null
        }
        if (!target) {
          conflicts.push({ nodeId: u.nodeId, conflictRef: `node ref not found: ${u.nodeId}` })
          continue
        }
        const res = api.setNodeText(target.id, u.text)
        if (res.ok) applied++
        else conflicts.push({ nodeId: target.id, conflictRef: res.conflictRef ?? 'conflict' })
      }
      return { applied, conflicts }
    }
    if (ctx.inBatch) return { kind: 'json', payload: run() }
    api.beginBatch()
    try {
      const payload = run()
      api.commitBatch()
      return { kind: 'json', payload }
    } catch (err) {
      api.rollbackBatch()
      throw err
    }
  },
}

const nodeDelete: McpToolDef = {
  name: 'aidea_node_delete',
  title: 'mcp.tools.aidea_node_delete',
  description:
    'Delete nodes INCLUDING their whole subtrees (one undoable history entry). DESTRUCTIVE: only call when the user explicitly asked for deletion; the user can undo it. Returns the expanded count of removed nodes.',
  inputSchema: schema({
    type: 'object',
    properties: {
      nodeIds: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
    },
    required: ['nodeIds'],
    additionalProperties: false,
  }),
  risk: 'danger',
  handler: (args) => {
    const nodeStore = useNodeStore()
    const refs = args.nodeIds as string[]
    // 入口统一解析（句柄/名字/id）；任一失败整体报错，不做"猜"
    const ids = refs.map((ref) => resolveNodeRef(ref).id)
    // 子树展开计数（去重：祖先与后代同时入选时按后代一次计）
    const expanded = new Set<string>()
    for (const id of ids) for (const d of nodeStore.descendantsOf(id)) expanded.add(d)
    if (expanded.size > MCP_LIMITS.maxDeletesPerCall) {
      throw new ToolError(`too many deletions: ${expanded.size} nodes (incl. subtrees) > maxDeletesPerCall ${MCP_LIMITS.maxDeletesPerCall}`)
    }
    useCommands().deleteNodes(ids)
    return { kind: 'json', payload: { deletedIds: ids, deletedCount: expanded.size } }
  },
}

const nodeMove: McpToolDef = {
  name: 'aidea_node_move',
  title: 'mcp.tools.aidea_node_move',
  description:
    'Move nodes. mode "delta": shift nodeIds by dx/dy. mode "absolute": place each entry of positions [{nodeId,x,y}] at an explicit top-left position. Undoable as ONE history entry.',
  inputSchema: schema({
    type: 'object',
    properties: {
      nodeIds: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
      mode: { type: 'string', enum: ['delta', 'absolute'] },
      dx: { type: 'number' },
      dy: { type: 'number' },
      positions: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: { nodeId: { type: 'string', minLength: 1 }, x: { type: 'number' }, y: { type: 'number' } },
          required: ['nodeId', 'x', 'y'],
          additionalProperties: false,
        },
      },
    },
    required: ['nodeIds', 'mode'],
    additionalProperties: false,
  }),
  risk: 'write',
  handler: (args, ctx) => {
    const nodeStore = useNodeStore()
    const commands = useCommands()
    const nodeApi = adapter.api.node
    const mode = String(args.mode)
    const ids = (args.nodeIds as string[]).map((ref) => resolveNodeRef(ref).id)

    if (mode === 'delta') {
      const dx = typeof args.dx === 'number' ? args.dx : 0
      const dy = typeof args.dy === 'number' ? args.dy : 0
      nodeApi.move(ids, { dx, dy })
      return { kind: 'json', payload: { moved: ids.length } }
    }
    const positions = (args.positions as Array<{ nodeId: string; x: number; y: number }> | undefined)?.map((p) => ({
      ...p,
      nodeId: resolveNodeRef(p.nodeId).id,
    }))
    if (!positions || positions.length === 0) {
      throw new ToolError('mode "absolute" requires positions[{nodeId,x,y}]')
    }
    const moveAbsolute = (): number => {
      let moved = 0
      for (const p of positions) {
        const n = nodeStore.getNode(p.nodeId)
        if (!n) continue
        nodeApi.move([p.nodeId], { dx: p.x - n.x, dy: p.y - n.y })
        moved++
      }
      return moved
    }
    if (ctx.inBatch) return { kind: 'json', payload: { moved: moveAbsolute() } }
    commands.beginBatch()
    try {
      const moved = moveAbsolute()
      commands.commitBatch()
      return { kind: 'json', payload: { moved } }
    } catch (err) {
      commands.rollbackBatch()
      throw err
    }
  },
}

const nodeArrange: McpToolDef = {
  name: 'aidea_node_arrange',
  title: 'mcp.tools.aidea_node_arrange',
  description:
    'Re-arrange the direct children of a node into a grid/row/column layout (pure geometry: moves nodes, creates/deletes nothing). Undoable as ONE history entry.',
  inputSchema: schema({
    type: 'object',
    properties: {
      parentId: { type: 'string', minLength: 1, description: 'Node ref (handle/name/id) whose children get re-arranged.' },
      arrangement: { type: 'string', enum: ['grid', 'row', 'column'] },
      gap: { type: 'number', minimum: 0, maximum: 500, description: 'Default 24.' },
      includeConnections: { type: 'boolean', description: 'Reserved; connections follow their nodes automatically.' },
    },
    required: ['parentId', 'arrangement'],
    additionalProperties: false,
  }),
  risk: 'write',
  handler: (args, ctx) => {
    const nodeStore = useNodeStore()
    const commands = useCommands()
    const nodeApi = adapter.api.node
    const parent = resolveNodeRef(String(args.parentId))
    const parentId = parent.id
    const arrangement = String(args.arrangement) as 'grid' | 'row' | 'column'
    const gap = typeof args.gap === 'number' ? args.gap : MCP_LAYOUT_GAP
    const children = nodeStore.childrenOf(parentId)
    if (children.length === 0) throw new ToolError(`node ${parentId} has no children to arrange`)
    if (children.length > MCP_LIMITS.maxNodesPerCreate) {
      throw new ToolError(`too many children: ${children.length} > maxNodesPerCreate ${MCP_LIMITS.maxNodesPerCreate}`)
    }

    // 行/列沿用子节点当前最小 x/y 作基准；grid 用子节点最大宽高做均匀网格
    const minX = Math.min(...children.map((c) => c.x))
    const minY = Math.min(...children.map((c) => c.y))
    const cellW = Math.max(...children.map((c) => c.width)) + gap
    const cellH = Math.max(...children.map((c) => c.height)) + gap
    const cols = arrangement === 'grid' ? Math.ceil(Math.sqrt(children.length)) : children.length
    const targets = children.map((c, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      return {
        id: c.id,
        x: arrangement === 'column' ? minX : minX + col * cellW,
        y: arrangement === 'row' ? minY : minY + row * cellH,
      }
    })

    const arrange = (): number => {
      let moved = 0
      for (const t of targets) {
        const n = nodeStore.getNode(t.id)
        if (!n || (n.x === t.x && n.y === t.y)) continue
        nodeApi.move([t.id], { dx: t.x - n.x, dy: t.y - n.y })
        moved++
      }
      return moved
    }
    if (ctx.inBatch) return { kind: 'json', payload: { arranged: children.length, moved: arrange() } }
    commands.beginBatch()
    try {
      const moved = arrange()
      commands.commitBatch()
      return { kind: 'json', payload: { arranged: children.length, moved } }
    } catch (err) {
      commands.rollbackBatch()
      throw err
    }
  },
}

const nodeReparent: McpToolDef = {
  name: 'aidea_node_reparent',
  title: 'mcp.tools.aidea_node_reparent',
  description:
    'Move nodes to a different parent (cross-view migration; internal connections follow, external ones are removed). Optional position = same top-left drop point for all moved nodes. Undoable as ONE history entry.',
  inputSchema: schema({
    type: 'object',
    properties: {
      nodeIds: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, description: 'Node refs (handle/name/id).' },
      newParentId: { type: 'string', minLength: 1, description: 'New parent node ref (handle/name/id).' },
      position: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        required: ['x', 'y'],
        additionalProperties: false,
        description: 'Optional common top-left position for the moved nodes.',
      },
    },
    required: ['nodeIds', 'newParentId'],
    additionalProperties: false,
  }),
  risk: 'write',
  handler: (args) => {
    const refs = args.nodeIds as string[]
    const newParent = resolveNodeRef(String(args.newParentId))
    const ids = refs.map((ref) => resolveNodeRef(ref).id)
    const newParentId = newParent.id
    const pos = args.position as { x: number; y: number } | undefined
    useCommands().reparentTo(ids, newParentId, pos ? new Map(ids.map((id) => [id, { x: pos.x, y: pos.y }])) : new Map())
    return { kind: 'json', payload: {} }
  },
}

const nodeGroup: McpToolDef = {
  name: 'aidea_node_group',
  title: 'mcp.tools.aidea_node_group',
  description:
    'Wrap nodes into a new container node (children re-parented under it, internal connections preserved; one undoable history entry). Requires at least 2 nodes.',
  inputSchema: schema({
    type: 'object',
    properties: {
      nodeIds: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 2 },
      title: { type: 'string', description: 'Container title. Default "组合".' },
    },
    required: ['nodeIds'],
    additionalProperties: false,
  }),
  risk: 'write',
  handler: (args, ctx) => {
    const ids = (args.nodeIds as string[]).map((ref) => resolveNodeRef(ref).id)
    const commands = useCommands()
    const title = typeof args.title === 'string' ? args.title : undefined
    const run = (): string => {
      const containerId = commands.groupNodes(ids)
      if (!containerId) throw new ToolError('group failed (need at least 2 valid nodes)')
      if (title && title !== '组合') {
        const res = commands.setNodeText(containerId, title)
        if (!res.ok) throw new ToolError(`group title conflict: ${res.conflictRef ?? ''}`)
      }
      return containerId
    }
    if (ctx.inBatch) return { kind: 'json', payload: { groupNodeId: run() } }
    commands.beginBatch()
    try {
      const groupNodeId = run()
      commands.commitBatch()
      return { kind: 'json', payload: { groupNodeId } }
    } catch (err) {
      commands.rollbackBatch()
      throw err
    }
  },
}

/** 节点域工具（T3/T5–T11） */
export const NODE_TOOLS: McpToolDef[] = [
  nodeGet,
  nodeCreate,
  nodeSetText,
  nodeDelete,
  nodeMove,
  nodeArrange,
  nodeReparent,
  nodeGroup,
]
