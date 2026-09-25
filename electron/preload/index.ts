/**
 * preload/index.ts —— contextBridge 窄桥：
 * - aideaDesktop 插件桥：插件系统（扫描/订阅插件目录）；
 * - aideaWindow 窗口控制桥：窗口 chrome（最小化/最大化切换/关闭/最大化状态推送）。
 * - aideaFile 文件桥桥：文件操作（打开/另存/记忆路径）。
 * 
 * 安全边界：只暴露契约白名单内的方法；绝不暴露 fs/path/shell/dialog、
 * 任何携带路径参数的通道、ipcRenderer 本体。形状用类型标注对齐两个 Bridge 接口，
 * 契约漂移（字段改名/签名变化）会在 type-check 期暴露。
 *
 * sandbox: true 下 preload 以受限 CJS 运行，只能 require('electron') 的白名单模块
 * （contextBridge/ipcRenderer 等）；esbuild external: ['electron'] 保证运行时 require，
 * shared/bridge.ts（纯常量与类型）可安全被打进产物。
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { DesktopBridge, FileBridge, WindowBridge } from '../shared/bridge'
import { IPC } from '../shared/bridge'

const bridge: DesktopBridge = {
  kind: 'desktop',
  /** renderer → main invoke：目录由 main 决定，renderer 永远不给路径 */
  listPlugins: () => ipcRenderer.invoke(IPC.LIST),
  /** main → renderer 订阅转发：返回取消订阅函数（M1 main 不发送，订阅本身一次到位） */
  onPluginsChanged: (cb: (ids: string[]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, ids: string[]): void => {
      cb(ids)
    }
    ipcRenderer.on(IPC.CHANGED, listener)
    return () => {
      ipcRenderer.removeListener(IPC.CHANGED, listener)
    }
  },
}

const fileBridge: FileBridge = {
  /** renderer → main invoke：打开项目（main 用原生对话框选路径 + readFile） */
  openProject: () => ipcRenderer.invoke(IPC.FILE_OPEN),
  /** renderer → main invoke：另存项目（main 用 showSaveDialog 选路径 + writeFile） */
  saveProject: (opts) => ipcRenderer.invoke(IPC.FILE_SAVE, opts),
  /** renderer → main invoke：覆盖写入已记忆路径（Ctrl+S 覆盖保存） */
  writeFile: (opts) => ipcRenderer.invoke(IPC.FILE_WRITE, opts),
  /** renderer → main invoke：读取已记忆路径内容（打开最近文件 / 重读） */
  readFile: (opts) => ipcRenderer.invoke(IPC.FILE_READ, opts),
}

const windowBridge: WindowBridge = {
  /** renderer → main send（fire-and-forget）：最小化 */
  minimize: () => ipcRenderer.send(IPC.WINDOW_MINIMIZE),
  /** renderer → main send（fire-and-forget）：切换最大化/还原（toggle 语义在 main 侧判定） */
  toggleMaximize: () => ipcRenderer.send(IPC.WINDOW_TOGGLE_MAXIMIZE),
  /** renderer → main send（fire-and-forget）：关闭窗口 */
  close: () => ipcRenderer.send(IPC.WINDOW_CLOSE),
  /** renderer → main invoke：查询是否最大化（main 用 fromWebContents(sender) 取目标窗口） */
  isMaximized: () => ipcRenderer.invoke(IPC.WINDOW_IS_MAXIMIZED),
  /** main → renderer 订阅转发：最大化状态变更（载荷 boolean），返回取消订阅函数 */
  onMaximizedChange: (cb: (maximized: boolean) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, maximized: boolean): void => {
      cb(maximized)
    }
    ipcRenderer.on(IPC.WINDOW_MAXIMIZED_CHANGED, listener)
    return () => {
      ipcRenderer.removeListener(IPC.WINDOW_MAXIMIZED_CHANGED, listener)
    }
  },
}

contextBridge.exposeInMainWorld('aideaDesktop', bridge)
contextBridge.exposeInMainWorld('aideaWindow', windowBridge)
contextBridge.exposeInMainWorld('aideaFile', fileBridge)
