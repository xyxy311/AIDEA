/**
 * index.ts —— Electron main 进程入口：privileged schemes → app 生命周期 → 主窗口。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §7 / §9。
 *
 * 关键时序：
 * 1. registerSchemesAsPrivileged 必须在 app ready 之前调用（模块顶层，不能放进 whenReady）；
 * 2. ready 后注册协议 handler 与 IPC，再创建窗口；
 * 3. 加载策略：dev（VITE_DEV_SERVER_URL 存在）loadURL vite 服务；生产 loadURL('app://./index.html')。
 *    刻意不用 file://——file:// 的 origin 为 null，CORS/ESM 动态 import 行为与 dev 不一致。
 */
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { registerIpc } from './ipc'
import { registerPrivilegedSchemes, registerProtocolHandlers } from './protocol'

// —— privileged schemes：必须先于 app ready 注册（Chromium 在 ready 前固化协议能力）——
registerPrivilegedSchemes()

let mainWindow: BrowserWindow | null = null

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      // esbuild 打包后 __dirname = dist-electron/，preload 与 main 同目录
      preload: path.join(__dirname, 'preload.cjs'),
      // 安全基座：渲染层零 Node 能力，桥只经 preload 白名单暴露
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadURL('app://./index.html')
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

void app.whenReady().then(() => {
  // 协议 handler 与 IPC 都在 ready 后注册（protocol.handle 依赖 ready）
  registerProtocolHandlers()
  registerIpc()
  createMainWindow()

  // macOS 惯例：Dock 图标点击重新创建窗口（window-all-closed 已 quit，此分支只在窗口被关但 app 未退时兜底）
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

// 桌面工具：全平台 window-all-closed 直接退出（不做 macOS 常驻，简化 M1 语义）
app.on('window-all-closed', () => {
  app.quit()
})
