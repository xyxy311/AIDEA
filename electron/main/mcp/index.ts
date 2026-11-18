/**
 * mcp/index.ts —— MCP 子系统装配与生命周期（main 侧唯一引导点）。
 * initMcp()：读配置 → toolBridge attach → enabled 才 startMcpServer()；
 * setMcpConfig()：校验 → 落盘 → 即时 stop/start → 状态推送（设置面板改配置即生效）。
 */
import { BrowserWindow, app } from 'electron'
import {
  IPC,
  type McpConfig,
  type McpConfigPatch,
  type McpStatus,
  type McpToolCallResult,
  type McpWindowInfo,
} from '../../shared/bridge'
import { applyPatch, readConfig, writeConfig } from './config'
import { ToolBridge } from './toolBridge'
import { createMcpServer, type McpServerHandle } from './server'
import type { RpcCallContext } from './rpc'

const SERVER_NAME = 'aidea'
const SERVER_VERSION = '0.1.0'

let config: McpConfig | null = null
let toolBridge: ToolBridge | null = null
let server: McpServerHandle | null = null

/** rpc 分派上下文：清单/窗口态来自 toolBridge 缓存，执行转发 renderer */
function buildRpcContext(bridge: ToolBridge): RpcCallContext {
  return {
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    getTools: () => bridge.getTools(),
    getResources: () => bridge.getResources(),
    callTool: async (windowId, name, args): Promise<McpToolCallResult> =>
      bridge.toCallResult(await bridge.call(windowId, name, args)),
    windowsList: () => bridge.windowsList(),
    readResource: async (uri) => {
      const res = await bridge.call(undefined, '__resource__', { uri })
      if (res.ok && res.result) {
        // host 约定：resource 读取结果 content[0] 为 text 项（renderer 已按 mime 组装文本）
        const first = res.result.content[0]
        if (first && first.type === 'text') {
          const parsed = safeParse(first.text)
          if (parsed && typeof parsed === 'object' && 'mimeType' in (parsed as object) && 'text' in (parsed as object)) {
            const p = parsed as { mimeType: string; text: string }
            return [{ uri, mimeType: p.mimeType, text: p.text }]
          }
        }
      }
      throw new Error(res.error ?? 'resource read failed')
    },
    defaultWindowId: () => bridge.defaultWindowId(),
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** 构建当前运行状态快照（推送设置面板用） */
export function getMcpStatus(): McpStatus {
  return {
    enabled: config?.enabled ?? false,
    running: server?.isRunning() ?? false,
    port: config?.port ?? 9876,
    error: server?.getLastError() ?? null,
  }
}

/** 向所有存活窗口推送状态 */
function broadcastStatus(): void {
  const status = getMcpStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.MCP_STATUS, status)
  }
}

/**
 * app ready 后调用一次：读配置、装配 toolBridge、按开关启动服务器。
 * userData 目录经 app.getPath 注入（config 模块保持零 electron 依赖）。
 */
export async function initMcp(): Promise<void> {
  const dir = app.getPath('userData')
  config = await readConfig(dir)
  toolBridge = new ToolBridge(config.limits.toolTimeoutMs)
  toolBridge.attach()
  server = createMcpServer({
    getConfig: () => config!,
    ctx: buildRpcContext(toolBridge),
    onStatusChange: broadcastStatus,
  })
  if (config.enabled) {
    server.start()
  }
  broadcastStatus()
}

/** app will-quit：停服务器 + pending 全部失败 */
export async function stopMcp(): Promise<void> {
  toolBridge?.dispose()
  await server?.stop()
}

/** 读取当前配置（renderer getConfig 通道） */
export function getMcpConfig(): McpConfig {
  if (!config) throw new Error('MCP not initialized')
  return config
}

/** ipc.ts 注册回执/清单/窗口态通道时取当前桥实例（initMcp 之前为 null） */
export function getToolBridge(): ToolBridge | null {
  return toolBridge
}

/**
 * 应用增量配置（renderer setConfig 通道）：校验失败返回结构化错误；
 * 成功则落盘并按需 stop/start（enabled/port 变化即时生效），最后推送新状态。
 */
export async function setMcpConfig(patch: McpConfigPatch): Promise<McpConfig> {
  if (!config || !server) throw new Error('MCP not initialized')
  const result = applyPatch(config, patch)
  if (!result.ok) throw new Error(result.error)
  const prev = config
  config = result.config
  await writeConfig(app.getPath('userData'), config)
  toolBridge?.setTimeout?.(config.limits.toolTimeoutMs)

  const needsRestart = !config.enabled || config.port !== prev.port
  if (server.isRunning() && needsRestart) {
    await server.stop()
  }
  if (config.enabled && !server.isRunning()) {
    server.start()
  }
  broadcastStatus()
  return config
}
