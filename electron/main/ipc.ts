/**
 * ipc.ts —— main 进程 IPC 通道注册。通道名来自 bridge.ts 的 IPC 常量（白名单集中评审，禁止散落字符串）。
 */
import path from 'node:path'
import fs from 'node:fs/promises'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import iconv from 'iconv-lite'
import {
  IPC,
  type FsOpenRequest,
  type FsSaveRequest,
  type FsReadRequest,
  type FsWriteRequest,
} from '../shared/bridge'
import { rescan } from './plugins'
import { getI18nFile, rescanI18n } from './i18n'
import { getMcpConfig, getMcpStatus, getToolBridge, setMcpConfig } from './mcp'

/** 项目文件对话框的过滤规则（mutable 数组，匹配 Electron FileFilter 类型） */
const PROJECT_FILTERS: Electron.FileFilter[] = [
  { name: '头脑风暴白板项目', extensions: ['aidea.json', 'json'] },
]

/** 通用 fs 桥的默认文本编码 */
const DEFAULT_ENCODING = 'utf-8'

/** 校验编码是否受 iconv-lite 支持并解析默认值；非法抛错（调用方自行捕获） */
function requireEncoding(encoding: string, fallback = DEFAULT_ENCODING): string {
  const resolved = encoding || fallback
  if (!iconv.encodingExists(resolved)) throw new Error(`fs: 不支持的文本编码：${resolved}`)
  return resolved
}

// ── 多窗口「项目已打开」去重登记表 ──

/** 各窗口当前打开的项目路径（win.id → 规范化路径）；仅登记已保存过路径的项目，未命名不登记 */
const windowProjects = new Map<number, string>()

/** 路径规范化：Windows 忽略大小写，保证同一文件不同大小写也能命中 */
function normalizePath(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p
}

/**
 * 聚焦指定窗口（还原最小化 + 显示 + 前置）。
 * 供 PROJECT_CLAIM 命中时跳转到拥有该项目的窗口。
 */
function focusWindow(win: Electron.BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

/** 窗口关闭后移除其登记项（index.ts 的 closed 回调调用） */
export function unregisterProjectWindow(winId: number): void {
  windowProjects.delete(winId)
}

/** 读取字节并按指定文本编码解码 */
async function readText(filePath: string, enc: string): Promise<string> {
  const buf = await fs.readFile(filePath)
  return iconv.decode(buf, requireEncoding(enc))
}

/** 按 mode 读取文件：text 返回解码字符串，binary 返回原始字节副本（跨 IPC 结构化克隆） */
async function readPayload(
  filePath: string,
  mode: 'text' | 'binary',
  encoding?: string,
): Promise<{ content?: string; bytes?: Uint8Array }> {
  if (mode === 'binary') {
    return { bytes: new Uint8Array(await fs.readFile(filePath)) }
  }
  return { content: await readText(filePath, encoding ?? DEFAULT_ENCODING) }
}

/** 按 mode 将载荷编码后写入 filePath（path 由调用方回传的令牌 / 对话框选定的路径确定） */
async function writePayload(
  filePath: string,
  req: Pick<FsSaveRequest | FsWriteRequest, 'mode' | 'encoding' | 'content' | 'bytes'>,
): Promise<void> {
  if (req.mode === 'binary') {
    await fs.writeFile(filePath, Buffer.from(req.bytes ?? new Uint8Array()))
    return
  }
  const enc = requireEncoding(req.encoding ?? DEFAULT_ENCODING)
  await fs.writeFile(filePath, iconv.encode(req.content ?? '', enc))
}

/** app ready 后调用一次 */
export function registerIpc(): void {
  // 列出插件：每次调用重扫，刷新白名单 + 返回最新条目。
  ipcMain.handle(IPC.LIST, () => rescan())

  // IPC.CHANGED：M1 只预留（main 不发送，watch 属 M2），preload 侧订阅转发已实现。

  // 列出运行时 i18n 语言文件：每次调用重扫，刷新白名单 + 返回最新条目（含新登记的调用方下拉立即可用）。
  ipcMain.handle(IPC.I18N_LIST, () => rescanI18n())

  // 读取指定语言文件内容：renderer 只传 id，id→绝对路径由扫描「id↔文件名」强校验后锁定进白名单，
  // 白名单外 id 一律拒绝（无任何 traversal 面；i18n 白名单即 fsGuard 语义）。
  ipcMain.handle(IPC.I18N_READ, async (_event, id: string) => {
    const filePath = getI18nFile(id)
    if (!filePath) throw new Error('i18n: 语言 id 未在运行时 i18n 白名单内')
    return { content: await fs.readFile(filePath, 'utf8') }
  })

  // 窗口控制统一用 fromWebContents(event.sender) 取目标窗口：多窗口安全，不依赖模块级引用。
  ipcMain.on(IPC.WINDOW_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on(IPC.WINDOW_TOGGLE_MAXIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  // 关闭用 destroy() 强制销毁，绕过 renderer beforeunload 防线（否则脏项目下会被二次拦截）；
  // 窗口销毁后 window-all-closed → app.quit() 退出链路照常生效。
  ipcMain.on(IPC.WINDOW_CLOSE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.destroy()
  })

  // 查询是否最大化；窗口已销毁等异常场景兜底返回 false。
  ipcMain.handle(IPC.WINDOW_IS_MAXIMIZED, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  // 项目文件通道（dialog + fs；renderer 不接触文件系统，文件位置由 main 决定）
  ipcMain.handle(IPC.FILE_OPEN, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = { filters: [...PROJECT_FILTERS], properties: ['openFile' as const] }
    const res = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
    const filePath = res.canceled ? undefined : res.filePaths[0]
    if (!filePath) return { canceled: true }
    const content = await fs.readFile(filePath, 'utf8')
    return { canceled: false, path: filePath, name: path.basename(filePath), content }
  })

  // 另存项目。对话框不自动补后缀，按用户所选写入。
  ipcMain.handle(IPC.FILE_SAVE, async (event, opts: { defaultName?: string; content: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const dialogOpts = { defaultPath: opts.defaultName, filters: [...PROJECT_FILTERS] }
    const res = win
      ? await dialog.showSaveDialog(win, dialogOpts)
      : await dialog.showSaveDialog(dialogOpts)
    const filePath = res.canceled ? undefined : res.filePath
    if (!filePath) return { canceled: true }
    await fs.writeFile(filePath, opts.content, 'utf8')
    return { canceled: false, path: filePath, name: path.basename(filePath) }
  })

  // 覆盖写入已记忆路径（Ctrl+S 保存）。路径来自 renderer 自持的最近/记忆列表。
  ipcMain.handle(
    IPC.FILE_WRITE,
    async (_event, opts: { path: string; content: string }) => {
      await fs.writeFile(opts.path, opts.content, 'utf8')
    },
  )

  // 读取已记忆路径内容（打开最近文件 / 重读）。路径同上来自 renderer 自持的最近列表。
  ipcMain.handle(IPC.FILE_READ, async (_event, opts: { path: string }) => {
    const content = await fs.readFile(opts.path, 'utf8')
    return { content }
  })

  // ── 通用任意文件读写（window.aideaFs）；open/save 对话框定路径，write/read 只收已记忆路径令牌 ──

  // 打开 + 读取：对话框选定路径后按 mode 交付 content（text）/ bytes（binary）。
  ipcMain.handle(IPC.FS_OPEN, async (event, req: FsOpenRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts: Electron.OpenDialogOptions = {
      title: req.title,
      filters: req.filters,
      properties: ['openFile'],
    }
    const res = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
    const filePath = res.canceled ? undefined : res.filePaths[0]
    if (!filePath) return { canceled: true }
    const payload = await readPayload(filePath, req.mode, req.encoding)
    return { canceled: false, path: filePath, name: path.basename(filePath), ...payload }
  })

  // 另存 + 写入：对话框选定路径后按 mode 编码写入。
  ipcMain.handle(IPC.FS_SAVE, async (event, req: FsSaveRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const dialogOpts: Electron.SaveDialogOptions = {
      title: req.title,
      defaultPath: req.defaultName,
      filters: req.filters,
    }
    const res = win
      ? await dialog.showSaveDialog(win, dialogOpts)
      : await dialog.showSaveDialog(dialogOpts)
    const filePath = res.canceled ? undefined : res.filePath
    if (!filePath) return { canceled: true }
    const { mode, encoding, content, bytes } = req
    await writePayload(filePath, { mode, encoding, content, bytes })
    return { canceled: false, path: filePath, name: path.basename(filePath) }
  })

  // 覆盖写已记忆路径（open/save 返回的令牌）。
  ipcMain.handle(IPC.FS_WRITE, async (_event, req: FsWriteRequest) => {
    await writePayload(req.path, req)
  })

  // 重读已记忆路径（open 返回的令牌）。
  ipcMain.handle(IPC.FS_READ, async (_event, req: FsReadRequest) => {
    const payload = await readPayload(req.path, req.mode, req.encoding)
    return { path: req.path, ...payload }
  })

  // 登记当前窗口打开的项目路径（null = 未命名/新建）。
  ipcMain.handle(IPC.PROJECT_SET_PATH, (event, path: string | null) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (path) windowProjects.set(win.id, normalizePath(path))
    else windowProjects.delete(win.id)
  })

  // 打开项目前询问：该路径是否已被其它窗口打开。是则 main 聚焦该窗口并返回 intercepted=true。
  // 排除请求方自身（同一窗口重开同一文件属正常刷新，不应拦截）。
  ipcMain.handle(IPC.PROJECT_CLAIM, (event, path: string) => {
    const requested = normalizePath(path)
    const selfId = BrowserWindow.fromWebContents(event.sender)?.id
    for (const [id, opened] of windowProjects) {
      if (id === selfId) continue
      if (opened === requested) {
        const owner = BrowserWindow.fromId(id)
        if (owner && !owner.isDestroyed()) {
          focusWindow(owner)
          return { intercepted: true, windowId: owner.id }
        }
      }
    }
    return { intercepted: false }
  })

  // ── Agent MCP（第 6 座桥；装配见 mcp/index.ts，initMcp 在 app ready 后调用）──

  // 配置读取 / 更新（更新即时生效并推送 MCP_STATUS）
  ipcMain.handle(IPC.MCP_CONFIG_GET, () => getMcpConfig())
  ipcMain.handle(IPC.MCP_CONFIG_SET, (_event, patch: Parameters<typeof setMcpConfig>[0]) => setMcpConfig(patch))
  // 状态快照：面板打开时主动拉取（推送只覆盖订阅后的变化）
  ipcMain.handle(IPC.MCP_STATUS_GET, () => getMcpStatus())

  // renderer → main：工具回执（requestId 匹配 pending）
  ipcMain.on(IPC.MCP_RESPONSE, (_event, res) => {
    getToolBridge()?.resolveResponse(res)
  })

  // renderer → main：工具/resource 清单缓存（按发送窗口盖章缓存）
  ipcMain.on(IPC.MCP_PUBLISH_TOOLS, (event, tools, resources) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    getToolBridge()?.setManifests(win.id, tools ?? [], resources ?? [])
  })

  // renderer → main：窗口业务态上报（windowId 以 webContents 归属为准，不信任载荷）
  ipcMain.on(IPC.MCP_WINDOW_STATE, (event, state) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    getToolBridge()?.reportWindowState(win.id, state)
  })
}
