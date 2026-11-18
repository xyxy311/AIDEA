/**
 * mcp/tools/misc.ts —— 附加域工具：T15 打标签 / T16 切视图 / T17 历史 / T18 批量 /
 * T19 标签清单 / T20 截图 / T21 窗口清单（main 本地应答，仅登记清单）。
 */
import { ROOT_NODE_ID, useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useCommands } from '@/composables/useCommands'
import { useHistoryStore } from '@/stores/history'
import { adapter } from '@/plugin/adapter'
import { MCP_LIMITS, MCP_SCREENSHOT_DEFAULT_MAX_WIDTH, MCP_SCREENSHOT_MAX_WIDTH_CAP } from '../constants'
import type { McpToolDef, McpToolOutput } from '../types'
import { ToolError, requireNode, schema } from './shared'
import { findTool } from '../registry'

// konva 惰性加载：registry 链路（含纯函数单测）不因 import 本文件而触发 konva 的 node 入口

// ── T15 tag_apply ──

const tagApply: McpToolDef = {
  name: 'aidea_tag_apply',
  title: 'mcp.tools.aidea_tag_apply',
  description:
    'Apply tags to nodes by tag name; missing tag definitions are created on the fly (definition layer, not undoable). mode "append" (default) keeps existing tags per node, "replace" overwrites. Node tag changes are undoable as ONE history entry.',
  inputSchema: schema({
    type: 'object',
    properties: {
      nodeIds: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
      tagNames: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
      mode: { type: 'string', enum: ['append', 'replace'], description: 'Default "append".' },
    },
    required: ['nodeIds', 'tagNames'],
    additionalProperties: false,
  }),
  risk: 'write',
  handler: (args, ctx) => {
    const nodeStore = useNodeStore()
    const api = adapter.api
    const commands = useCommands()
    const ids = args.nodeIds as string[]
    const tagNames = args.tagNames as string[]
    const mode = typeof args.mode === 'string' ? args.mode : 'append'
    for (const id of ids) requireNode(id)

    // 缺失标签先建（定义层，不可撤销）；重名精确匹配复用
    const existing = api.tag.list()
    const createdTags: Array<{ id: string; name: string; color: string }> = []
    const tagIds = tagNames.map((name) => {
      const found = existing.find((t) => t.name === name)
      if (found) return found.id
      const tag = api.tag.add(name)
      createdTags.push({ id: tag.id, name: tag.name, color: tag.color })
      return tag.id
    })

    const apply = (): void => {
      if (mode === 'replace') {
        commands.updateSelectedNodesTags(ids, tagIds)
        return
      }
      // append：逐节点并入现有标签集合
      const perNode = ids.map((id) => {
        const n = nodeStore.getNode(id)
        return [...new Set([...(n?.tagIds ?? []), ...tagIds])]
      })
      commands.updateNodesTagsPerNode(ids, perNode)
    }
    if (ctx.inBatch) {
      apply()
      return { kind: 'json', payload: { tagIds, createdTags } }
    }
    commands.beginBatch()
    try {
      apply()
      commands.commitBatch()
      return { kind: 'json', payload: { tagIds, createdTags } }
    } catch (err) {
      commands.rollbackBatch()
      throw err
    }
  },
}

// ── T16 view_switch ──

const viewSwitch: McpToolDef = {
  name: 'aidea_view_switch',
  title: 'mcp.tools.aidea_view_switch',
  description:
    'Switch the main view to another node (its direct children become the view content). View state only; not part of undo history.',
  inputSchema: schema({
    type: 'object',
    properties: {
      nodeId: { type: 'string', minLength: 1 },
    },
    required: ['nodeId'],
    additionalProperties: false,
  }),
  risk: 'write',
  handler: (args) => {
    const nodeId = String(args.nodeId)
    requireNode(nodeId)
    adapter.api.view.switch(nodeId)
    return { kind: 'json', payload: { viewedNodeId: nodeId, isMain: nodeId === ROOT_NODE_ID } }
  },
}

// ── T17 history ──

const history: McpToolDef = {
  name: 'aidea_history',
  title: 'mcp.tools.aidea_history',
  description:
    'Undo or redo the project history, or read its status. Each MCP write call is one history entry, so undo reverts the last tool call.',
  inputSchema: schema({
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['undo', 'redo', 'status'] },
    },
    required: ['action'],
    additionalProperties: false,
  }),
  risk: 'write',
  handler: (args) => {
    const action = String(args.action)
    const api = adapter.api.project
    if (action === 'undo') api.undo()
    else if (action === 'redo') api.redo()
    return { kind: 'json', payload: { canUndo: api.canUndo(), canRedo: api.canRedo(), action } }
  },
}

// ── T18 aidea_batch ──

const batch: McpToolDef = {
  name: 'aidea_batch',
  title: 'mcp.tools.aidea_batch',
  description:
    'Run multiple WRITE tool calls atomically: all ops share one undo history entry; on the first failure everything is rolled back (ok=false, isError=true, failedAt=index). ops items: {tool, args}. Only write tools allowed, no nested aidea_batch, max maxOpsPerBatch ops. Read tools are rejected — call them directly instead. Note: tag definitions created during a failed batch are kept (definition layer is not undoable).',
  inputSchema: schema({
    type: 'object',
    properties: {
      ops: {
        type: 'array',
        minItems: 1,
        maxItems: MCP_LIMITS.maxOpsPerBatch,
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string', minLength: 1 },
            args: { type: 'object', description: 'Arguments object passed to the tool (same shape as a direct call).' },
          },
          required: ['tool'],
          additionalProperties: false,
        },
      },
    },
    required: ['ops'],
    additionalProperties: false,
  }),
  risk: 'danger',
  handler: async (args, ctx) => {
    if (ctx.inBatch) throw new ToolError('aidea_batch cannot be nested')
    const ops = args.ops as Array<{ tool: string; args?: Record<string, unknown> }>
    if (ops.length > MCP_LIMITS.maxOpsPerBatch) {
      throw new ToolError(`too many ops: ${ops.length} > maxOpsPerBatch ${MCP_LIMITS.maxOpsPerBatch}`)
    }
    // 预检：仅写工具
    for (const op of ops) {
      const tool = findTool(op.tool)
      if (!tool || tool.handler === undefined) throw new ToolError(`unknown tool: ${op.tool}`)
      if (tool.risk === 'read') throw new ToolError(`read tool not allowed in batch: ${op.tool}`)
    }

    const commands = useCommands()
    const historyStore = useHistoryStore()
    // pinia setup store 的 ref 经实例访问已解包：past/friends 直接是数组
    const pastBefore = historyStore.past.length

    /** 首错信息（携带已成功的部分结果与失败位置） */
    class BatchFailure extends Error {
      constructor(
        message: string,
        readonly failedAt: number,
        readonly failedTool: string,
        readonly partial: Array<{ tool: string; ok: boolean; payload?: unknown }>,
      ) {
        super(message)
      }
    }

    commands.beginBatch()
    try {
      const results: Array<{ tool: string; ok: boolean; payload?: unknown }> = []
      const batchCtx = { inBatch: true }
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i]
        try {
          const tool = findTool(op.tool)!
          if (!tool.handler) throw new ToolError(`unknown tool: ${op.tool}`)
          const out = (await tool.handler(op.args ?? {}, batchCtx)) as McpToolOutput
          results.push({ tool: op.tool, ok: true, payload: out.kind === 'json' ? out.payload : { image: true } })
        } catch (err) {
          throw new BatchFailure(err instanceof Error ? err.message : String(err), i, op.tool, results)
        }
      }
      commands.commitBatch()
      return { kind: 'json', payload: { ok: true, results } }
    } catch (err) {
      // 真回滚：收拢部分变更（无变更则不产生历史）→ undo 还原数据 → 丢弃 undo 产生的 redo 残留。
      // 已创建的标签定义属定义层（不可撤销），回滚后保留（见工具描述）。
      commands.commitBatch()
      if (historyStore.past.length > pastBefore) {
        commands.undo()
        historyStore.future.pop()
      }
      if (err instanceof BatchFailure) {
        return {
          kind: 'json',
          isError: true,
          payload: { ok: false, results: err.partial, failedAt: err.failedAt, failedTool: err.failedTool, error: err.message },
        }
      }
      throw err
    }
  },
}

// ── T19 tag_list ──

const tagList: McpToolDef = {
  name: 'aidea_tag_list',
  title: 'mcp.tools.aidea_tag_list',
  description: 'List all tag definitions with per-tag node counts.',
  inputSchema: schema({ type: 'object', properties: {}, additionalProperties: false }),
  risk: 'read',
  handler: () => {
    const nodeStore = useNodeStore()
    const tags = adapter.api.tag.list().map((t) => ({ id: t.id, name: t.name, color: t.color, nodeCount: nodeStore.nodesWithTag(t.id).length }))
    return { kind: 'json', payload: { tags } }
  },
}

// ── T20 screenshot ──

/** konva 结构化最小类型（规避 konva 包类型入口对 Stage/stages 的导出差异，零类型耦合） */
interface StageLike {
  width(): number
  height(): number
  container(): HTMLElement | null
  toDataURL(config: { pixelRatio?: number; x?: number; y?: number; width?: number; height?: number }): string
}
interface KonvaLike {
  stages: StageLike[]
}

/** 定位主视图 Konva stage：主视图容器元素由 view store 持有（CanvasStage 注册） */
function findMainStage(Konva: KonvaLike): StageLike | null {
  const container = useViewStore('main').containerEl
  if (!container) return null
  return Konva.stages.find((s) => s.container()?.parentElement === container) ?? null
}

/** 按 maxWidth 上限与总像素上限计算 capture pixelRatio */
function capturePixelRatio(captureWidth: number, captureHeight: number, maxWidth: number): number {
  let ratio = Math.min(2, maxWidth / Math.max(captureWidth, 1))
  const maxPixels = 16_000_000
  const pixels = captureWidth * captureHeight
  if (pixels * ratio * ratio > maxPixels) {
    ratio = Math.sqrt(maxPixels / pixels)
  }
  return Math.max(ratio, 0.05)
}

const screenshot: McpToolDef = {
  name: 'aidea_screenshot',
  title: 'mcp.tools.aidea_screenshot',
  description:
    'Capture the canvas as a PNG image so you can see it. mode "viewport" (default) captures the current visible viewport; mode "board" captures the bounding box of all nodes. maxWidth caps the output width in pixels (default 1600).',
  inputSchema: schema({
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['viewport', 'board'], description: 'Default "viewport".' },
      maxWidth: { type: 'integer', minimum: 200, maximum: MCP_SCREENSHOT_MAX_WIDTH_CAP, description: 'Default 1600.' },
    },
    additionalProperties: false,
  }),
  risk: 'read',
  handler: async (args) => {
    const Konva = (await import('konva')) as unknown as KonvaLike
    const stage = findMainStage(Konva)
    if (!stage) throw new ToolError('canvas stage is not available (window not rendered?)')
    if (stage.width() <= 0 || stage.height() <= 0) throw new ToolError('canvas has zero size (window minimized or hidden?)')
    const mode = typeof args.mode === 'string' ? args.mode : 'viewport'
    const maxWidth = typeof args.maxWidth === 'number' ? args.maxWidth : MCP_SCREENSHOT_DEFAULT_MAX_WIDTH

    let capture: { x?: number; y?: number; width: number; height: number }
    if (mode === 'board') {
      const nodeStore = useNodeStore()
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const n of nodeStore.nodes.values()) {
        if (n.parentId === null) continue
        minX = Math.min(minX, n.x)
        minY = Math.min(minY, n.y)
        maxX = Math.max(maxX, n.x + n.width)
        maxY = Math.max(maxY, n.y + n.height)
      }
      if (!Number.isFinite(minX)) throw new ToolError('board is empty (no nodes)')
      capture = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    } else {
      capture = { width: stage.width(), height: stage.height() }
    }

    const pixelRatio = capturePixelRatio(capture.width, capture.height, maxWidth)
    const dataUrl = stage.toDataURL({ ...capture, pixelRatio })
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    return { kind: 'image', data: base64, mimeType: 'image/png' }
  },
}

// ── T21 windows_list（main 本地应答，仅登记清单；handler 缺省） ──

const windowsList: McpToolDef = {
  name: 'aidea_windows_list',
  title: 'mcp.tools.aidea_windows_list',
  description:
    'List open app windows with windowId, focus state, project name, dirty flag and tool readiness. Pass a windowId to other tools to target a specific window; omit it to follow the last focused window. Answered by the app shell (main process) directly.',
  inputSchema: schema({ type: 'object', properties: {}, additionalProperties: false }),
  risk: 'read',
}

/** 附加域工具（T15–T21） */
export const MISC_TOOLS: McpToolDef[] = [tagApply, viewSwitch, history, batch, tagList, screenshot, windowsList]
