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
 *
 * 无边框窗口：不用 frame:false——Windows 上 titleBarStyle:'hidden' 同样隐藏原生标题栏与
 * 窗口按钮，但保留 thickFrame 默认的窗口边缘拖拽 resize；不设 titleBarOverlay 以免系统
 * 按钮（Windows）与自绘按钮重叠；macOS 用 hiddenInset 保留红绿灯，Windows 忽略该值。
 * 配套：Menu.setApplicationMenu(null) 彻底删除原生菜单栏（副作用是默认菜单 role 的
 * accelerator 一并失效，由 shortcuts.ts 的 attachWindowShortcuts 兜底恢复编辑快捷键与 devtools）。
 */
import { app, BrowserWindow, Menu, dialog } from 'electron'
import path from 'node:path'
import { IPC } from '../shared/bridge'
import { registerIpc } from './ipc'
import { startPluginWatching } from './pluginWatch'
import { registerPrivilegedSchemes, registerProtocolHandlers } from './protocol'
import { attachWindowShortcuts } from './shortcuts'

// —— privileged schemes：必须先于 app ready 注册（Chromium 在 ready 前固化协议能力）——
registerPrivilegedSchemes()

// 彻底删除原生菜单栏：无边框窗口自带自绘 chrome，原生菜单只会抢占顶部空间；
// 副作用是默认菜单 role 快捷键（复制/粘贴/undo/devtools 等）一并失效，由 attachWindowShortcuts 兜底
Menu.setApplicationMenu(null)

let mainWindow: BrowserWindow | null = null

function createMainWindow(): void {
  // 局部 win 引用：后续回调（最大化推送 / will-prevent-unload）闭包捕获同一实例，
  // 避免 TS 对模块级可空变量的收窄问题
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    // 无边框：隐藏原生标题栏与窗口按钮（见文件头注释的方案取舍说明）
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      // esbuild 打包后 __dirname = dist-electron/，preload 与 main 同目录
      preload: path.join(__dirname, 'preload.cjs'),
      // 安全基座：渲染层零 Node 能力，桥只经 preload 白名单暴露
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = win

  // 最大化状态推送：向 renderer 广播（载荷 boolean；最大化/进入全屏 = true，离开 = false）。
  // Aero Snap 半屏不算最大化——isMaximized() 本就返回 false，无需特殊处理。
  const sendMaximized = (maximized: boolean): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send(IPC.WINDOW_MAXIMIZED_CHANGED, maximized)
  }
  win.on('maximize', () => sendMaximized(true))
  win.on('unmaximize', () => sendMaximized(false))
  win.on('enter-full-screen', () => sendMaximized(true))
  win.on('leave-full-screen', () => sendMaximized(false))

  // 系统关闭路径的安全网（Alt+F4 / 任务栏右键关闭等）：win.close() → renderer beforeunload
  // 拦截时 Electron 触发本事件，main 弹原生 MessageBox 做最后一道确认。
  // 注意：应用内关闭按钮走 IPC.WINDOW_CLOSE → destroy() 强制销毁，不经过本确认（避免双弹窗）。
  // 文案硬编码中文：main 进程无 i18n 层（i18n 资源属 renderer 的 src/locales，main 不 import src/）。
  win.webContents.on('will-prevent-unload', (event) => {
    // showMessageBoxSync 返回选中的按钮索引；defaultId/cancelId 都指向「取消」(1)，
    // Enter/Esc/关闭对话框均为安全侧（不退出）。
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: '未保存的改动',
      message: '当前项目有未保存的改动，退出将丢失这些改动。',
      buttons: ['退出并放弃改动', '取消'],
      defaultId: 1,
      cancelId: 1,
    })
    // will-prevent-unload 语义：event.preventDefault() = 忽略 beforeunload、允许卸载；
    // 不调用 = 维持拦截（窗口保持打开）。用户选「退出并放弃改动」(0) 才放行。
    if (choice === 0) event.preventDefault()
  })

  // 无边框后菜单删除带走的快捷键兜底（编辑快捷键 + 开发期 devtools）
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
  // 协议 handler 与 IPC 都在 ready 后注册（protocol.handle 依赖 ready）
  registerProtocolHandlers()
  registerIpc()
  createMainWindow()

  // M2 插件目录 watch：插件目录增删改经 IPC.CHANGED 推送给 renderer（变更 id 列表）
  startPluginWatching()

  // macOS 惯例：Dock 图标点击重新创建窗口（window-all-closed 已 quit，此分支只在窗口被关但 app 未退时兜底）
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

// 桌面工具：全平台 window-all-closed 直接退出（不做 macOS 常驻，简化 M1 语义）
app.on('window-all-closed', () => {
  app.quit()
})
