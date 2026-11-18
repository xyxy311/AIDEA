/**
 * mcp/toolBridge.ts —— main→renderer 工具调用请求-回执桥。
 * pending map（requestId → resolve）+ 窗口路由（显式 windowId → 最近聚焦 → 首个）+ 超时兜底；
 * 同时缓存 renderer 发布的工具/resource 清单与窗口业务态（aidea_windows_list / tools/list 数据源）。
 */
import { app, BrowserWindow } from 'electron'
import {
  IPC,
  type McpResourceManifest,
  type McpToolManifest,
  type McpToolRequest,
  type McpToolResponse,
  type McpToolCallResult,
  type McpWindowInfo,
  type McpWindowState,
} from '../../shared/bridge'

interface PendingCall {
  resolve: (res: McpToolResponse) => void
  timer: ReturnType<typeof setTimeout>
  windowId: number
}

/** 未就绪/无窗口等短路错误的错误文本（与 renderer 工具错误统一走 isError:true 文本） */
export type ToolBridgeFailure = 'no_window' | 'not_ready' | 'timeout' | 'shutting_down'

export class ToolBridge {
  private pending = new Map<string, PendingCall>()
  /** 各窗口发布清单的时间戳（存在即视为该窗口 toolReady 信号源之一；最终以窗口态上报为准） */
  private manifests = new Map<number, { tools: McpToolManifest[]; resources: McpResourceManifest[] }>()
  private windowStates = new Map<number, McpWindowState>()
  private lastFocusedWindowId: number | null = null
  private disposed = false

  constructor(private timeoutMs: number) {}

  /** 配置变更时更新超时（仅影响后续调用） */
  setTimeout(ms: number): void {
    this.timeoutMs = ms
  }

  /** 订阅全局窗口事件（聚焦跟踪 + 关闭清理）。app ready 后调用一次。 */
  attach(): void {
    app.on('browser-window-focus', (_event, win) => {
      this.lastFocusedWindowId = win.id
    })
    app.on('browser-window-created', (_event, win) => {
      win.once('closed', () => {
        this.windowStates.delete(win.id)
        this.manifests.delete(win.id)
        this.rejectPendingForWindow(win.id, 'no_window')
      })
    })
  }

  /** renderer → main：缓存工具/resource 清单 */
  setManifests(windowId: number, tools: McpToolManifest[], resources: McpResourceManifest[]): void {
    this.manifests.set(windowId, { tools, resources })
  }

  /** tools/list 数据源：任一窗口的最新清单（各窗口同一 renderer 代码，取首个非空） */
  getTools(): McpToolManifest[] {
    for (const entry of this.manifests.values()) {
      if (entry.tools.length > 0) return entry.tools
    }
    return []
  }

  getResources(): McpResourceManifest[] {
    for (const entry of this.manifests.values()) {
      if (entry.resources.length > 0) return entry.resources
    }
    return []
  }

  /** renderer → main：上报窗口业务态（windowId 已由 ipc 层盖章） */
  reportWindowState(windowId: number, state: McpWindowState): void {
    this.windowStates.set(windowId, state)
  }

  /** aidea_windows_list 数据源：存活窗口 ∪ 已缓存业务态 */
  windowsList(): McpWindowInfo[] {
    const live = new Map<number, BrowserWindow>()
    for (const win of BrowserWindow.getAllWindows()) live.set(win.id, win)
    const ids = new Set<number>([...live.keys(), ...this.windowStates.keys()])
    const result: McpWindowInfo[] = []
    for (const id of ids) {
      const win = live.get(id)
      if (!win || win.isDestroyed()) continue
      const state = this.windowStates.get(id) ?? { projectName: '', dirty: false, toolReady: false }
      result.push({
        windowId: id,
        focused: win.isFocused() || (this.lastFocusedWindowId === id && !BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isFocused())),
        ...state,
      })
    }
    return result
  }

  /** 缺省路由窗口：显式 windowId → 最近聚焦 → 首个存活窗口 */
  routeWindow(windowId?: number): BrowserWindow | null {
    if (windowId !== undefined) {
      const win = BrowserWindow.fromId(windowId)
      return win && !win.isDestroyed() ? win : null
    }
    const focused = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isFocused())
    if (focused) return focused
    if (this.lastFocusedWindowId !== null) {
      const win = BrowserWindow.fromId(this.lastFocusedWindowId)
      if (win && !win.isDestroyed()) return win
    }
    return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null
  }

  /** 最近聚焦窗口 id（rpc 回显用） */
  defaultWindowId(): number | null {
    return this.routeWindow()?.id ?? null
  }

  /**
   * 转发工具调用到目标窗口并等待回执。
   * 短路失败（无窗口/未就绪）与超时都 resolve 为 ok:false（不抛异常，调用方统一转 isError 文本）。
   */
  call(windowId: number | undefined, tool: string, args: Record<string, unknown>): Promise<McpToolResponse> {
    const fail = (error: string): McpToolResponse => ({ requestId: '', ok: false, error })
    if (this.disposed) return Promise.resolve(fail('shutting_down'))
    const win = this.routeWindow(windowId)
    if (!win) return Promise.resolve(fail(windowId !== undefined ? `no window with id ${windowId}` : 'no_window'))
    if (!this.manifests.has(win.id)) {
      return Promise.resolve(fail('renderer host not ready for this window (not_ready)'))
    }
    const requestId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const request: McpToolRequest = { requestId, tool, args }
    return new Promise<McpToolResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        resolve(fail(`tool call timed out after ${this.timeoutMs}ms`))
      }, this.timeoutMs)
      this.pending.set(requestId, { resolve, timer, windowId: win.id })
      win.webContents.send(IPC.MCP_REQUEST, request)
    })
  }

  /** renderer → main：工具回执（按 requestId 匹配 pending） */
  resolveResponse(res: McpToolResponse): void {
    const pending = this.pending.get(res.requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(res.requestId)
    pending.resolve(res)
  }

  /** 将 McpToolResponse 归一为最终 MCP 结果（ok=false → isError:true 单行文本） */
  toCallResult(res: McpToolResponse): McpToolCallResult {
    if (res.ok && res.result) return res.result
    return { content: [{ type: 'text', text: res.error ?? 'unknown error' }], isError: true }
  }

  private rejectPendingForWindow(windowId: number, _reason: ToolBridgeFailure): void {
    for (const [id, pending] of this.pending) {
      if (pending.windowId !== windowId) continue
      clearTimeout(pending.timer)
      this.pending.delete(id)
      pending.resolve({ requestId: id, ok: false, error: 'target window closed' })
    }
  }

  /** app 退出前调用：所有 pending 立即失败（shutting_down） */
  dispose(): void {
    this.disposed = true
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.resolve({ requestId: id, ok: false, error: 'shutting_down' })
    }
    this.pending.clear()
    this.manifests.clear()
    this.windowStates.clear()
  }
}
