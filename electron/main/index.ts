/**
 * index.ts —— Electron main 进程入口：privileged schemes 注册 → app 生命周期 → 主窗口。
 * 协议 scheme 须在 app ready 前注册；dev 走 VITE_DEV_SERVER_URL，生产走 app://（刻意不用 file://，避免 origin 为 null 致 CORS/ESM 行为不一致）。
 * 无边框用 titleBarStyle:'hidden'（macOS hiddenInset）；Menu.setApplicationMenu(null) 删除原生菜单栏，快捷键由 attachWindowShortcuts 兜底。
 */
import { app, BrowserWindow, Menu, dialog } from 'electron'
import path from 'node:path'
import { IPC } from '../shared/bridge'
import { registerIpc } from './ipc'
import { startPluginWatching } from './pluginWatch'
import { startI18nWatching } from './i18nWatch'
import { registerPrivilegedSchemes, registerProtocolHandlers } from './protocol'
import { attachWindowShortcuts } from './shortcuts'

// privileged schemes 必须先于 app ready 注册（Chromium 在 ready 前固化协议能力）
registerPrivilegedSchemes()

// 删除原生菜单栏（无边框自绘 chrome，不占顶部空间）；默认 role 快捷键随之失效，由 attachWindowShortcuts 兜底
Menu.setApplicationMenu(null)

let mainWindow: BrowserWindow | null = null

function createMainWindow(): void {
  // 局部 win 引用：后续回调闭包捕获同一实例，避免对模块级可空变量的收窄问题
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    // 无边框方案见文件头注释
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      // esbuild 打包后 __dirname = dist-electron/，preload 与 main 同目录
      preload: path.join(__dirname, 'preload.cjs'),
      // 安全基座：渲染层零 Node 能力，仅供 preload 白名单桥
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = win

  // 最大化状态推送（true=最大化/全屏，false=离开；Aero Snap 半屏 isMaximized 本为 false，无需处理）
  const sendMaximized = (maximized: boolean): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send(IPC.WINDOW_MAXIMIZED_CHANGED, maximized)
  }
  win.on('maximize', () => sendMaximized(true))
  win.on('unmaximize', () => sendMaximized(false))
  win.on('enter-full-screen', () => sendMaximized(true))
  win.on('leave-full-screen', () => sendMaximized(false))

  // 系统关闭路径（Alt+F4/任务栏关闭）的最终确认网：renderer beforeunload 被拦截时弹原生 MessageBox。
  // 应用内关闭按钮走 IPC.WINDOW_CLOSE → destroy() 强制销毁，不经过本确认（避免双弹窗）。
  // 文案硬编码中文：main 无 i18n 层，不能 import renderer 的 locales。
  win.webContents.on('will-prevent-unload', (event) => {
    // defaultId/cancelId 都指向「取消」(1)：Enter/Esc/关闭对话框均不退出
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: '未保存的改动',
      message: '当前项目有未保存的改动，退出将丢失这些改动。',
      buttons: ['退出并放弃改动', '取消'],
      defaultId: 1,
      cancelId: 1,
    })
    // preventDefault() = 忽略 beforeunload、允许卸载；用户选「退出并放弃改动」(0) 才放行
    if (choice === 0) event.preventDefault()
  })

  // 菜单删除后快捷键兜底（编辑快捷键 + 开发期 devtools）
  attachWindowShortcuts(win)

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadURL('app://./index.html')
  }

  win.on('closed', () => {
    mainWindow = null
  })
}

void app.whenReady().then(() => {
  // 协议 handler 与 IPC 都依赖 ready
  registerProtocolHandlers()
  registerIpc()
  createMainWindow()

  // 插件目录 watch：增删改经 IPC.CHANGED 推送给 renderer
  startPluginWatching()
  // 运行时 i18n 目录 watch：增删改经 IPC.I18N_CHANGED 推送给 renderer（语言即插即用热登记）
  startI18nWatching()

  // macOS 惯例：Dock 点击重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

// 桌面工具：全平台 window-all-closed 直接退出（不做 macOS 常驻）
app.on('window-all-closed', () => {
  app.quit()
})
