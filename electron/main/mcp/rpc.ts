/**
 * mcp/rpc.ts —— JSON-RPC 2.0 / MCP 协议分派纯函数（无状态 Streamable HTTP 语义，零 electron 依赖）。
 * 方法白名单：initialize / notifications/* / ping / tools/list / tools/call / resources/list / resources/read。
 * 工具清单与 resource 清单由 renderer 发布、main 缓存（tools/list 恒定不随连接变化）；
 * 工具执行经 ctx.callTool 转发 renderer（此处不做任何业务）。
 */
import type {
  McpContentItem,
  McpResourceManifest,
  McpToolCallResult,
  McpToolManifest,
  McpWindowInfo,
} from '../../shared/bridge'

/** 服务端支持的协议版本（无状态修订优先；initialize 时客户端版本不在列表则回落到首个） */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const

/** JSON-RPC 错误码 */
export const RPC_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  /** 服务端自定义：并发/频率超限 */
  LIMIT_EXCEEDED: -32000,
} as const

/** JSON-RPC 响应（成功或错误） */
export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

/** rpc 分派的业务上下文（server.ts 注入实现） */
export interface RpcCallContext {
  serverInfo: { name: string; version: string }
  getTools(): McpToolManifest[]
  getResources(): McpResourceManifest[]
  /** 转发 renderer 执行；windowId 为 undefined 时路由最近聚焦窗口 */
  callTool(windowId: number | undefined, name: string, args: Record<string, unknown>): Promise<McpToolCallResult>
  /** main 本地应答：窗口集合 + 各窗口业务态 */
  windowsList(): McpWindowInfo[]
  /** resource 同步按需生成（renderer 执行） */
  readResource(uri: string): Promise<Array<{ uri: string; mimeType: string; text: string }>>
  /** 最近聚焦窗口 id（无则 null），供未带 windowId 的调用回显 */
  defaultWindowId(): number | null
}

/** 工具调用由 main 本地应答的名单（不转发 renderer） */
const LOCAL_TOOLS = new Set(['aidea_windows_list'])

function makeError(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } }
}

function makeResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

/** 非 JSON-RPC 场景（401/403/405/413/500）的统一 JSON 错误体 */
export function makeErrorText(message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id: null, error: { code: RPC_ERROR.INTERNAL_ERROR, message } }
}


/** content 快捷构造：单文本项 */
export function textResult(text: string, isError = false): McpToolCallResult {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) }
}

/** 任意载荷 → content[{type:'text', text: JSON}] */
export function jsonContent(payload: unknown): McpContentItem[] {
  return [{ type: 'text', text: JSON.stringify(payload) }]
}

/** 单条 JSON-RPC 消息分派；notification（无 id）返回 null */
export function handleRpcMessage(msg: unknown, ctx: RpcCallContext): JsonRpcResponse | null {
  if (typeof msg !== 'object' || msg === null) {
    return makeError(null, RPC_ERROR.INVALID_REQUEST, 'Request must be an object')
  }
  const { method, id, params } = msg as Record<string, unknown>
  if (typeof method !== 'string') {
    return makeError(normId(id), RPC_ERROR.INVALID_REQUEST, 'Missing string method')
  }
  // notification：无 id 字段 → 不应答
  const hasId = 'id' in (msg as Record<string, unknown>)
  if (!hasId) return null
  const nid = normId(id)

  switch (method) {
    case 'initialize': {
      const requested = (typeof params === 'object' && params !== null ? (params as Record<string, unknown>).protocolVersion : undefined) as string | undefined
      const version =
        typeof requested === 'string' && (MCP_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
          ? requested
          : MCP_SUPPORTED_PROTOCOL_VERSIONS[0]
      return makeResult(nid, {
        protocolVersion: version,
        capabilities: { tools: {}, resources: {} },
        serverInfo: ctx.serverInfo,
      })
    }
    case 'ping':
      return makeResult(nid, {})
    case 'tools/list':
      return makeResult(nid, { tools: ctx.getTools() })
    case 'tools/call':
      return null // 异步方法，由 handleRpcAsync 分派
    case 'resources/list':
      return makeResult(nid, { resources: ctx.getResources() })
    case 'resources/read':
      return null // 异步方法
    default:
      return makeError(nid, RPC_ERROR.METHOD_NOT_FOUND, `Unknown method: ${method}`)
  }
}

function normId(id: unknown): string | number | null {
  if (typeof id === 'string' || typeof id === 'number') return id
  return null
}

/** tools/call 参数解析结果 */
type CallParams = { ok: true; windowId: number | undefined; name: string; args: Record<string, unknown> } | { ok: false; error: JsonRpcResponse }

/** 解析并剥离 windowId（路由用，不进入工具参数） */
function parseToolCallParams(params: unknown, id: string | number | null): CallParams {
  if (typeof params !== 'object' || params === null) {
    return { ok: false, error: makeError(id, RPC_ERROR.INVALID_PARAMS, 'params must be an object') }
  }
  const { name, arguments: argsRaw } = params as Record<string, unknown>
  if (typeof name !== 'string' || name.length === 0) {
    return { ok: false, error: makeError(id, RPC_ERROR.INVALID_PARAMS, 'params.name must be a non-empty string') }
  }
  let args: Record<string, unknown> = {}
  if (argsRaw !== undefined) {
    if (typeof argsRaw !== 'object' || argsRaw === null) {
      return { ok: false, error: makeError(id, RPC_ERROR.INVALID_PARAMS, 'params.arguments must be an object') }
    }
    args = { ...(argsRaw as Record<string, unknown>) }
  }
  let windowId: number | undefined
  if (args.windowId !== undefined) {
    if (typeof args.windowId !== 'number' || !Number.isInteger(args.windowId)) {
      return { ok: false, error: makeError(id, RPC_ERROR.INVALID_PARAMS, 'windowId must be an integer') }
    }
    windowId = args.windowId
    delete args.windowId
  }
  return { ok: true, windowId, name, args }
}

/** 异步方法分派（tools/call / resources/read）；同步方法应在 handleRpcMessage 已处理 */
export async function handleRpcAsync(method: string, params: unknown, id: string | number | null, ctx: RpcCallContext): Promise<JsonRpcResponse> {
  if (method === 'tools/call') {
    const parsed = parseToolCallParams(params, id)
    if (!parsed.ok) return parsed.error
    try {
      let result: McpToolCallResult
      if (LOCAL_TOOLS.has(parsed.name)) {
        result = { content: jsonContent({ windows: ctx.windowsList() }) }
      } else {
        const known = ctx.getTools().some((t) => t.name === parsed.name)
        if (!known) {
          return makeError(id, RPC_ERROR.INVALID_PARAMS, `Unknown tool: ${parsed.name}`)
        }
        result = await ctx.callTool(parsed.windowId, parsed.name, parsed.args)
      }
      return makeResult(id, result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return makeResult(id, textResult(message, true))
    }
  }
  if (method === 'resources/read') {
    const uri = typeof params === 'object' && params !== null ? (params as Record<string, unknown>).uri : undefined
    if (typeof uri !== 'string') {
      return makeError(id, RPC_ERROR.INVALID_PARAMS, 'params.uri must be a string')
    }
    const known = ctx.getResources().some((r) => r.uri === uri)
    if (!known) {
      return makeError(id, RPC_ERROR.INVALID_PARAMS, `Unknown resource: ${uri}`)
    }
    try {
      const contents = await ctx.readResource(uri)
      return makeResult(id, { contents })
    } catch (err) {
      return makeError(id, RPC_ERROR.INTERNAL_ERROR, err instanceof Error ? err.message : String(err))
    }
  }
  return makeError(id, RPC_ERROR.METHOD_NOT_FOUND, `Unknown method: ${method}`)
}

/** HTTP 层的最终产物：状态码 + 响应体（null = 202 无体） */
export interface RpcHttpResult {
  status: number
  body: JsonRpcResponse | JsonRpcResponse[] | null
}

/**
 * 分派一条 HTTP 请求体（单个对象或 batch 数组）。
 * 约定：同步方法在 handleRpcMessage 应答；tools/call、resources/read 经 handleRpcAsync。
 */
export async function handleRpcPayload(payload: unknown, ctx: RpcCallContext): Promise<RpcHttpResult> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return { status: 400, body: makeError(null, RPC_ERROR.INVALID_REQUEST, 'Empty batch') }
    }
    const responses: JsonRpcResponse[] = []
    for (const item of payload) {
      const immediate = handleRpcMessage(item, ctx)
      if (immediate) {
        responses.push(immediate)
        continue
      }
      const method = typeof item === 'object' && item !== null ? (item as Record<string, unknown>).method : undefined
      const id = typeof item === 'object' && item !== null ? normId((item as Record<string, unknown>).id) : null
      if (typeof method === 'string' && id !== null) {
        responses.push(await handleRpcAsync(method, (item as Record<string, unknown>).params, id, ctx))
      }
      // notification：无应答
    }
    if (responses.length === 0) return { status: 202, body: null }
    return { status: 200, body: responses }
  }

  const immediate = handleRpcMessage(payload, ctx)
  if (immediate) return { status: 200, body: immediate }
  const method = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>).method : undefined
  const id = typeof payload === 'object' && payload !== null ? normId((payload as Record<string, unknown>).id) : null
  if (typeof method === 'string' && id !== null) {
    return { status: 200, body: await handleRpcAsync(method, (payload as Record<string, unknown>).params, id, ctx) }
  }
  // 纯 notification（如 notifications/initialized）
  return { status: 202, body: null }
}
