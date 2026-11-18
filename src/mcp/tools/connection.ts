/**
 * mcp/tools/connection.ts —— 连线域工具：T12 建连线 / T13 删连线 / T14 改连线样式与文字。
 * 写全部经 useCommands（可撤销，单条历史）。
 */
import { useNodeStore } from '@/stores/node'
import { useCommands } from '@/composables/useCommands'
import type { LineStyle } from '@/types'
import type { McpToolDef } from '../types'
import { ToolError, requireNode, schema } from './shared'

const connectionAdd: McpToolDef = {
  name: 'aidea_connection_add',
  title: 'mcp.tools.aidea_connection_add',
  description:
    'Add a connection between two direct children of the same parent (same-level relation, not parent-child). Optional style overrides; text is a label on the line. Undoable as ONE history entry.',
  inputSchema: schema({
    type: 'object',
    properties: {
      parentId: { type: 'string', minLength: 1, description: 'The node whose view holds the connection (common parent of both ends).' },
      fromNodeId: { type: 'string', minLength: 1 },
      toNodeId: { type: 'string', minLength: 1 },
      lineStyle: { type: 'string', enum: ['solid', 'dashed', 'dotted'] },
      strokeColor: { type: 'string' },
      directed: { type: 'boolean' },
      text: { type: 'string', description: 'Optional label text on the connection.' },
    },
    required: ['parentId', 'fromNodeId', 'toNodeId'],
    additionalProperties: false,
  }),
  risk: 'write',
  handler: (args, ctx) => {
    const nodeStore = useNodeStore()
    const commands = useCommands()
    const parentId = String(args.parentId)
    const fromNodeId = String(args.fromNodeId)
    const toNodeId = String(args.toNodeId)
    requireNode(parentId)
    requireNode(fromNodeId)
    requireNode(toNodeId)
    if (!nodeStore.isChildOf(fromNodeId, parentId) || !nodeStore.isChildOf(toNodeId, parentId)) {
      throw new ToolError('both endpoints must be direct children of parentId')
    }
    const hasStyle =
      args.lineStyle !== undefined || args.strokeColor !== undefined || args.directed !== undefined || args.text !== undefined
    const patch = {
      ...(typeof args.lineStyle === 'string' ? { lineStyle: args.lineStyle as LineStyle } : {}),
      ...(typeof args.strokeColor === 'string' ? { strokeColor: args.strokeColor } : {}),
      ...(typeof args.directed === 'boolean' ? { directed: args.directed } : {}),
      ...(typeof args.text === 'string' ? { text: args.text } : {}),
    }
    const run = (): string => {
      const id = commands.addConnection(parentId, fromNodeId, toNodeId)
      if (!id) throw new ToolError('connection add failed')
      if (hasStyle) commands.updateConnectionsStyleByIds([id], patch)
      return id
    }
    if (ctx.inBatch) return { kind: 'json', payload: { connectionId: run() } }
    commands.beginBatch()
    try {
      const connectionId = run()
      commands.commitBatch()
      return { kind: 'json', payload: { connectionId } }
    } catch (err) {
      commands.rollbackBatch()
      throw err
    }
  },
}

const connectionRemove: McpToolDef = {
  name: 'aidea_connection_remove',
  title: 'mcp.tools.aidea_connection_remove',
  description: 'Remove connections by ids (across parents; one undoable history entry).',
  inputSchema: schema({
    type: 'object',
    properties: {
      connectionIds: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
    },
    required: ['connectionIds'],
    additionalProperties: false,
  }),
  risk: 'danger',
  handler: (args) => {
    const ids = args.connectionIds as string[]
    const nodeStore = useNodeStore()
    let removed = 0
    for (const id of ids) if (nodeStore.findConnectionById(id)) removed++
    useCommands().deleteConnectionsByIds(ids)
    return { kind: 'json', payload: { removed } }
  },
}

const connectionUpdate: McpToolDef = {
  name: 'aidea_connection_update',
  title: 'mcp.tools.aidea_connection_update',
  description:
    'Update style/label of connections by ids (across parents). patch.text: string to set a label, null to clear. Undoable as ONE history entry.',
  inputSchema: schema({
    type: 'object',
    properties: {
      connectionIds: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
      patch: {
        type: 'object',
        properties: {
          lineStyle: { type: 'string', enum: ['solid', 'dashed', 'dotted'] },
          strokeWidth: { type: 'number', minimum: 1, maximum: 10 },
          strokeColor: { type: 'string' },
          directed: { type: 'boolean' },
          text: { type: ['string', 'null'], description: 'Label text; null clears it.' },
        },
        additionalProperties: false,
      },
    },
    required: ['connectionIds', 'patch'],
    additionalProperties: false,
  }),
  risk: 'write',
  handler: (args) => {
    const ids = args.connectionIds as string[]
    const patch = args.patch as Record<string, unknown>
    if (Object.keys(patch).length === 0) throw new ToolError('patch is empty')
    const nodeStore = useNodeStore()
    let updated = 0
    for (const id of ids) if (nodeStore.findConnectionById(id)) updated++
    useCommands().updateConnectionsStyleByIds(ids, patch)
    return { kind: 'json', payload: { updated } }
  },
}

/** 连线域工具（T12–T14） */
export const CONNECTION_TOOLS: McpToolDef[] = [connectionAdd, connectionRemove, connectionUpdate]
