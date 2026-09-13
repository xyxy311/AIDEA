/**
 * ipc.ts —— main 进程 IPC 通道注册。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §3 / §10（红线 2：通道白名单）。
 * 通道名来自 electron/shared/bridge.ts 的 IPC 常量（契约集中评审，禁止散落字符串）。
 */
import { ipcMain } from 'electron'
import { IPC } from '../shared/bridge'
import { rescan } from './plugins'

/** app ready 后调用一次 */
export function registerIpc(): void {
  // renderer → main：列出本地插件（invoke）。每次调用都重扫：刷新白名单 + 返回最新条目。
  ipcMain.handle(IPC.LIST, () => rescan())

  // IPC.CHANGED：M1 只预留。main 此时不发送（watch + webContents.send 属 M2）；
  // preload 侧订阅转发已完整实现，契约一次到位。
}
