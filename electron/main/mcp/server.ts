/**
 * mcp/server.ts —— 本地 Streamable HTTP 服务器（仅 POST /mcp，绑 127.0.0.1）。
 * 安全：Origin 白名单（无 Origin 放行，防 DNS rebinding）+ Bearer token + 不返回任何 CORS 头；
 * 超限（并发/频率）返回结构化 JSON-RPC 错误；除 MCP 协议面外无任何路由。
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { McpConfig } from '../../shared/bridge'
import { CallLimiter } from './limiter'
import { RPC_ERROR, handleRpcPayload, makeErrorText, type RpcCallContext } from './rpc'

/** Origin 白名单：本机回环来源（任意端口）；无 Origin（CLI/桌面客户端）放行 */
const LOOPBACK_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

/** 请求体大小上限 */
const MAX_BODY_BYTES = 5 * 1024 * 1024

export interface McpServerHandle {
  start(): void
  stop(): Promise<void>
  isRunning(): boolean
  /** 实际监听端口（启动失败时为配置端口） */
  getPort(): number
  /** 最近一次启动/运行错误（null = 正常） */
  getLastError(): string | null
}

/** 向 limiter 注钥的客户端标识（IP；全局限流对 127.0.0.1 即单客户端） */
function clientKey(req: http.IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown'
}

export function createMcpServer(opts: {
  getConfig: () => McpConfig
  ctx: RpcCallContext
  /** 状态变化回调（启停/错误），用于推送 MCP_STATUS */
  onStatusChange?: () => void
}): McpServerHandle {
  let server: http.Server | null = null
  let running = false
  let lastError: string | null = null
  let limiter: CallLimiter | null = null

  function ensureLimiter(): CallLimiter {
    const { maxConcurrent, maxCallsPerMinute } = opts.getConfig().limits
    if (!limiter || !limiter.matches(maxConcurrent, maxCallsPerMinute)) {
      limiter = new CallLimiter(maxConcurrent, maxCallsPerMinute)
    }
    return limiter
  }

  function respond(res: http.ServerResponse, status: number, body: unknown): void {
    const payload = body === null ? '' : JSON.stringify(body)
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(payload)
  }

  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url ?? ''
    // 仅 POST /mcp：GET/DELETE 等一律 405（无状态模式无 SSE 流）
    if (req.method !== 'POST' || !url.startsWith('/mcp')) {
      respond(res, 405, makeErrorText('Method not allowed. POST /mcp only.'))
      return
    }
    // Origin 校验：无 Origin 放行（CLI/桌面客户端）；有 Origin 且非本机回环 → 403
    const origin = req.headers.origin
    if (origin !== undefined && !LOOPBACK_ORIGIN_RE.test(origin)) {
      respond(res, 403, makeErrorText('Origin not allowed'))
      return
    }
    // Bearer 校验
    const config = opts.getConfig()
    const auth = req.headers.authorization ?? ''
    if (auth !== `Bearer ${config.token}`) {
      respond(res, 401, makeErrorText('Unauthorized: missing or invalid bearer token'))
      return
    }

    // 并发 + 频率护栏（结构化 JSON-RPC 错误，不静默）
    const limiterInstance = ensureLimiter()
    const verdict = limiterInstance.tryAcquire(clientKey(req))
    if (verdict !== 'ok') {
      const message = verdict === 'concurrency' ? 'Too many concurrent tool calls' : 'Rate limit exceeded (maxCallsPerMinute)'
      respond(res, 429, { jsonrpc: '2.0', id: null, error: { code: RPC_ERROR.LIMIT_EXCEEDED, message } })
      return
    }

    try {
      const raw = await readBody(req)
      let payload: unknown
      try {
        payload = JSON.parse(raw.toString('utf8'))
      } catch {
        respond(res, 400, { jsonrpc: '2.0', id: null, error: { code: RPC_ERROR.PARSE_ERROR, message: 'Invalid JSON' } })
        return
      }
      const result = await handleRpcPayload(payload, opts.ctx)
      if (result.body === null) {
        res.writeHead(result.status)
        res.end()
        return
      }
      respond(res, result.status, result.body)
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'BODY_TOO_LARGE') {
        respond(res, 413, makeErrorText('Request body too large'))
        return
      }
      respond(res, 500, makeErrorText('Internal server error'))
    } finally {
      limiterInstance.release()
    }
  }

  function readBody(req: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          const err = new Error('body too large') as NodeJS.ErrnoException
          err.code = 'BODY_TOO_LARGE'
          reject(err)
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })
  }

  return {
    start() {
      if (running) return
      lastError = null
      const port = opts.getConfig().port
      const instance = http.createServer((req, res) => {
        void handleRequest(req, res)
      })
      instance.on('error', (err) => {
        running = false
        server = null
        lastError = err.message
        opts.onStatusChange?.()
      })
      instance.listen(port, '127.0.0.1', () => {
        running = true
        opts.onStatusChange?.()
      })
      server = instance
    },
    stop(): Promise<void> {
      const instance = server
      if (!instance) {
        running = false
        return Promise.resolve()
      }
      server = null
      return new Promise((resolve) => {
        // 立即掐断存活连接（pending 请求已由 toolBridge.dispose 兜底）
        instance.closeAllConnections()
        instance.close(() => {
          running = false
          opts.onStatusChange?.()
          resolve()
        })
      })
    },
    isRunning: () => running,
    getPort: () => (running ? (server?.address() as AddressInfo)?.port ?? opts.getConfig().port : opts.getConfig().port),
    getLastError: () => lastError,
  }
}
