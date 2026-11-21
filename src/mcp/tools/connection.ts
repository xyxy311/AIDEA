/**
 * mcp/tools/connection.ts —— 连线域工具：T12 建连线 / T13 删连线 / T14 改连线样式与文字。
 * 端点走 resolveNodeRef；连线引用接受 C<n> / "Nfrom>Nto" / 完整 id（D6）。
 * 写全部经 useCommands（可撤销，单条历史）。
 */
import { useNodeStore } from '@/stores/node'
import { useCommands } from '@/composables/useCommands'
import type { LineStyle } from '@/types'
import type { McpToolDef } from '../types'
import { ToolError, resolveConnRef, resolveConnectionPreset, resolveNodeRef, schema } from './shared'

const connectionAdd: McpToolDef = {
  name: 'aidea_connection_add',
  title: 'mcp.tools.aidea_connection_add',
  description:
    'Add a connection between two direct children of the same parent (same-level relation, not parent-child). preset: a connection preset name (e.g. "Red Dashed") expanding to lineStyle/strokeWidth/strokeColor/directed; explicit style fields override it; text is a label on the line. Endpoints accept handles N<code>, names or ids. Undoable as ONE history entry.',
  inputSchema: schema({
    type: 'object',
    properties: {
      parentId: { type: 'string', minLength: 1, description: 'The node whose view holds the connection (common parent of both ends); accepts handle/name/id.' },
      fromNodeId: { type: 'string', minLength: 1, description: 'Start node ref (handle/name/id).' },
      toNodeId: { type: 'string', minLength: 1, description: 'End node ref (handle/name/id).' },
      preset: { type: 'string', description: 'Connection preset name (expands to style fields).' },
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
    const parentId = resolveNodeRef(String(args.parentId)).id
    const fromNodeId = resolveNodeRef(String(args.fromNodeId)).id
    const toNodeId = resolveNodeRef(String(args.toNodeId)).id
    if (!nodeStore.isChildOf(fromNodeId, parentId) || !nodeStore.isChildOf(toNodeId, parentId)) {
      throw new ToolError('both endpoints must be direct children of parentId')
    }
    // 预设名 → 样式补丁；显式字段覆盖预设
    const presetPatch = typeof args.preset === 'string' ? resolveConnectionPreset(args.preset) : {}
    const patch: Record<string, unknown> = {
      ...presetPatch,
      ...(typeof args.lineStyle === 'string' ? { lineStyle: args.lineStyle as LineStyle } : {}),
      ...(typeof args.strokeColor === 'string' ? { strokeColor: args.strokeColor } : {}),
      ...(typeof args.directed === 'boolean' ? { directed: args.directed } : {}),
      ...(typeof args.text === 'string' ? { text: args.text } : {}),
    }
    const hasStyle = Object.keys(patch).length > 0
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
  description:
    'Remove connections (across parents; one undoable history entry). Each connectionId accepts C<n> (1-based index into the CURRENT view\'s connection list — re-read after deleting), "Nfrom>Nto" (node handles/names), or the full connection id. Resolved refs are echoed back as ids.',
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
    const refs = args.connectionIds as string[]
    const resolved = refs.map((ref) => resolveConnRef(ref))
    const ids = resolved.map((r) => r.connection.id)
    useCommands().deleteConnectionsByIds(ids)
    return { kind: 'json', payload: { removed: ids.length, connectionIds: ids } }
  },
}

const connectionUpdate: McpToolDef = {
  name: 'aidea_connection_update',
  title: 'mcp.tools.aidea_connection_update',
  description:
    'Update style/label of connections (across parents). Each connectionId accepts C<n> (CURRENT view index), "Nfrom>Nto", or the full id. patch.preset: connection preset name expanding to style fields; explicit patch fields override it. patch.text: string to set a label, null to clear. Undoable as ONE history entry.',
  inputSchema: schema({
    type: 'object',
    properties: {
      connectionIds: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
      patch: {
        type: 'object',
        properties: {
          preset: { type: 'string', description: 'Connection preset name (expands to style fields).' },
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
    const refs = args.connectionIds as string[]
    const resolved = refs.map((ref) => resolveConnRef(ref))
    const ids = resolved.map((r) => r.connection.id)
    const patch = args.patch as Record<string, unknown>
    const { preset, ...rest } = patch
    // 预设名 → 样式补丁；显式字段覆盖预设
    const expanded: Record<string, unknown> = {
      ...(typeof preset === 'string' ? resolveConnectionPreset(preset) : {}),
      ...rest,
    }
    if (Object.keys(expanded).length === 0) throw new ToolError('patch is empty')
    useCommands().updateConnectionsStyleByIds(ids, expanded)
    return { kind: 'json', payload: { updated: ids.length, connectionIds: ids } }
  },
}

/** 连线域工具（T12–T14） */
export const CONNECTION_TOOLS: McpToolDef[] = [connectionAdd, connectionRemove, connectionUpdate]
