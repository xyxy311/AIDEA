/**
 * mcp/host.ts —— renderer 侧 MCP 宿主（app 启动时装载一次）。
 * 职责：订阅 main→renderer 工具请求（校验/执行/回执，全部同步单 JSON）、
 * 发布工具与 resource 清单、上报窗口业务态、维护调用日志 ring buffer（设置面板订阅）。
 * 全 renderer 唯一访问 window.aideaMcp 的模块（架构红线）。
 */
import { watch } from 'vue'
import { adapter } from '@/plugin/adapter'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'
import type {
  McpConfig,
  McpConfigPatch,
  McpResourceManifest,
  McpStatus,
  McpToolCallResult,
  McpToolManifest,
  McpToolRequest,
  McpToolResponse,
} from '../../electron/shared/bridge'
import { MCP_RESOURCE_PSEUDO_TOOL } from './constants'
import { RESOURCES, TOOLS, findResource, findTool, runTool } from './registry'
import type { McpToolContext, McpToolOutput } from './types'

// ── 调用日志（ring buffer 100 + 订阅）──

export interface McpCallLogEntry {
  time: number
  tool: string
  /** 入参摘要（截断，避免设置面板卡顿/泄漏大文本） */
  argsDigest: string
  durationMs: number
  ok: boolean
  error?: string
}

const logBuffer: McpCallLogEntry[] = []
const logLimit = 100
const logSubscribers = new Set<(entries: McpCallLogEntry[]) => void>()

function pushLog(entry: McpCallLogEntry): void {
  logBuffer.unshift(entry)
  if (logBuffer.length > logLimit) logBuffer.pop()
  for (const fn of logSubscribers) fn([...logBuffer])
}

/** 设置面板订阅调用日志（立即回放当前内容）；返回退订函数 */
export function subscribeMcpLogs(cb: (entries: McpCallLogEntry[]) => void): () => void {
  logSubscribers.add(cb)
  cb([...logBuffer])
  return () => {
    logSubscribers.delete(cb)
  }
}

// ── 输出包装 ──

/** ToolOutput → 最终 MCP content（image 特例单独成项） */
function toCallResult(output: McpToolOutput): McpToolCallResult {
  if (output.kind === 'image') {
    return { content: [{ type: 'image', data: output.data, mimeType: output.mimeType }] }
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(output.payload) }],
    ...(output.isError === true ? { isError: true } : {}),
  }
}

/** resource 读取结果 → content text（main 侧解析 mimeType/text 二元组） */
function resourceCallResult(text: string): McpToolCallResult {
  return { content: [{ type: 'text', text }] }
}

/** 入参摘要：JSON 截断到 200 字符 */
function digestArgs(args: Record<string, unknown>): string {
  const text = JSON.stringify(args) ?? ''
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

// ── 清单发布与窗口态上报 ──

function buildToolManifests(): McpToolManifest[] {
  return TOOLS.map((t) => ({
    name: t.name,
    // MCP manifest title 用英文标签（name 派生）；UI 展示名走 i18n（registry.title 是 i18n key）
    title: t.name.replace(/^aidea_/, '').replace(/_/g, ' '),
    description: t.description,
    // 所有工具 schema 附带可选 windowId（main 在转发前取出剥离；此处的 main 是主进程）
    inputSchema: {
      ...t.inputSchema,
      properties: {
        ...(t.inputSchema.properties ?? {}),
        windowId: { type: 'integer', description: 'Target window id (see aidea_windows_list). Omit to follow the last focused window.' },
      },
    },
  }))
}

function buildResourceManifests(): McpResourceManifest[] {
  return RESOURCES.map((r) => ({ uri: r.uri, name: r.name, description: r.description, mimeType: r.mimeType }))
}

/** 上报本窗口业务态（projectName/dirty 变化与就绪时调用） */
function reportWindowState(toolReady: boolean): void {
  if (!window.aideaMcp) return
  const project = useProjectStore()
  const file = adapter.api.file
  window.aideaMcp.reportWindowState({
    projectName: project.projectName,
    dirty: file.dirty(),
    toolReady,
  })
}

/** 写工具结果附 undoHint（§7.6：本次产生了 N 条历史，模型可主动 undo 或提示用户 Ctrl+Z） */
function attachUndoHint(tool: string, output: McpToolOutput, pastBefore: number): void {
  const def = findTool(tool)
  if (!def || def.risk === 'read') return
  if (output.kind !== 'json' || output.isError === true) return
  const payload = output.payload
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return
  const added = useHistoryStore().past.length - pastBefore
  if (added <= 0) return
  ;(payload as Record<string, unknown>).undoHint =
    `Added ${added} undoable history ${added === 1 ? 'entry' : 'entries'}; revert with aidea_history {action:"undo"} or the user's Ctrl+Z.`
}

// ── 请求处理 ──

async function handleRequest(req: McpToolRequest): Promise<McpToolResponse> {
  const startedAt = Date.now()
  const ctx: McpToolContext = { inBatch: false }
  let response: McpToolResponse

  if (req.tool === MCP_RESOURCE_PSEUDO_TOOL) {
    const uri = typeof req.args.uri === 'string' ? req.args.uri : ''
    const resource = findResource(uri)
    if (!resource) {
      response = { requestId: req.requestId, ok: false, error: `unknown resource: ${uri}` }
    } else {
      try {
        const content = resource.read()
        const resolved = content instanceof Promise ? await content : content
        response = { requestId: req.requestId, ok: true, result: resourceCallResult(JSON.stringify(resolved)) }
      } catch (err) {
        response = { requestId: req.requestId, ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
    pushLog({ time: startedAt, tool: `resource:${uri}`, argsDigest: '', durationMs: Date.now() - startedAt, ok: response.ok, error: response.error })
    return response
  }

  const pastBefore = useHistoryStore().past.length
  const result = await runTool(req.tool, req.args, ctx)
  if (result.ok) attachUndoHint(req.tool, result.output, pastBefore)
  response = result.ok
    ? { requestId: req.requestId, ok: true, result: toCallResult(result.output) }
    : { requestId: req.requestId, ok: false, error: result.error }
  pushLog({
    time: startedAt,
    tool: req.tool,
    argsDigest: digestArgs(req.args),
    durationMs: Date.now() - startedAt,
    ok: response.ok,
    error: response.error,
  })
  return response
}

// ── 装载 ──

let installed = false

/**
 * renderer 入口（src/main.ts boot 内 mount 之后）调用一次：
 * 注册请求处理、发布清单、上报就绪并随 projectName/dirty 变化持续上报。
 * 非桌面形态（无 aideaMcp 桥，如测试环境）为 no-op。
 */
export function installMcpHost(): void {
  if (installed) return
  const bridge = window.aideaMcp
  if (!bridge) return
  installed = true

  bridge.onRequest((req) => {
    void handleRequest(req).then((res) => {
      try {
        bridge.respond(res)
      } catch (err) {
        console.error('[mcp] respond failed:', err)
      }
    })
  })

  bridge.publishTools(buildToolManifests(), buildResourceManifests())
  reportWindowState(true)

  // 项目名 / 脏标记变化 → 刷新窗口态缓存（aidea_windows_list 数据源）
  const project = useProjectStore()
  watch(
    () => [project.projectName, adapter.api.file.dirty()] as const,
    () => reportWindowState(true),
  )
}

/** 服务器状态推送（设置面板订阅）；桥缺失时返回空退订 */
export function onMcpStatus(cb: (status: McpStatus) => void): () => void {
  const bridge = window.aideaMcp
  if (!bridge) return () => {}
  return bridge.onStatus(cb)
}

/** 读取 MCP 配置（设置面板）；桥缺失时返回 null */
export async function getMcpConfigSafe(): Promise<McpConfig | null> {
  const bridge = window.aideaMcp
  if (!bridge) return null
  return bridge.getConfig()
}

/** 更新 MCP 配置（设置面板）；桥缺失时返回 null */
export async function setMcpConfigSafe(patch: McpConfigPatch): Promise<McpConfig | null> {
  const bridge = window.aideaMcp
  if (!bridge) return null
  return bridge.setConfig(patch)
}
