/**
 * ipc.ts —— main 进程 IPC 通道注册。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §3 / §10（红线 2：通道白名单）。
 * 通道名来自 electron/shared/bridge.ts 的 IPC 常量（契约集中评审，禁止散落字符串）。
 */
import path from 'node:path'
import fs from 'node:fs/promises'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '../shared/bridge'
import { rescan } from './plugins'

/** 项目文件对话框的过滤规则（mutable 数组，匹配 Electron FileFilter 类型） */
const PROJECT_FILTERS: Electron.FileFilter[] = [
  { name: '头脑风暴白板项目', extensions: ['aidea.json', 'json'] },
]

/** app ready 后调用一次 */
export function registerIpc(): void {
  // renderer → main：列出本地插件（invoke）。每次调用都重扫：刷新白名单 + 返回最新条目。
  ipcMain.handle(IPC.LIST, () => rescan())

  // IPC.CHANGED：M1 只预留。main 此时不发送（watch + webContents.send 属 M2）；
  // preload 侧订阅转发已完整实现，契约一次到位。

  // —— 窗口控制通道（send，fire-and-forget）——
  // 统一用 fromWebContents(event.sender) 取目标窗口：多窗口安全，不依赖模块级 mainWindow 引用。
  ipcMain.on(IPC.WINDOW_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on(IPC.WINDOW_TOGGLE_MAXIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  // renderer 已完成未保存改动确认（应用内 projectFile.confirmDiscard）后的关闭：
  // 用 destroy() 强制销毁以绕过 renderer 的 beforeunload 防线——若走 close()，
  // 脏项目下会被 renderer beforeunload 二次拦截，表现为点击关闭按钮无响应。
  // destroy 不触发 close 与页面的 unload/beforeunload，但窗口销毁后
  // window-all-closed → app.quit() 退出链路照常生效。
  ipcMain.on(IPC.WINDOW_CLOSE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.destroy()
  })

  // renderer → main：查询是否最大化（invoke）。窗口已销毁等异常场景兜底返回 false。
  ipcMain.handle(IPC.WINDOW_IS_MAXIMIZED, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  // ── 项目文件通道（dialog + fs；renderer 不接触文件系统）──
  // 打开项目：showOpenDialog 让用户选路径 → readFile。文件位置由 main 决定（红线：renderer 永不给路径）。
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

  // 另存项目：showSaveDialog 让用户选路径 → writeFile。对话框不自动补后缀，按用户所选写入。
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

  // 覆盖写入已记忆路径（Ctrl+S 覆盖保存）。renderer 回传「此前由对话框产生的路径」，
  // 即应用自身持久化的最近/记忆路径，main 仅对其做磁盘写入。
  ipcMain.handle(
    IPC.FILE_WRITE,
    async (_event, opts: { path: string; content: string }) => {
      await fs.writeFile(opts.path, opts.content, 'utf8')
    },
  )

  // 读取已记忆路径内容（打开最近文件 / 重读）。同上，路径来自 renderer 自持的最近列表。
  ipcMain.handle(IPC.FILE_READ, async (_event, opts: { path: string }) => {
    const content = await fs.readFile(opts.path, 'utf8')
    return { content }
  })
}
