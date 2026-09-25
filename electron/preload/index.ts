/**
 * preload/index.ts —— contextBridge 窄桥，暴露三座桥：
 * aideaDesktop（插件系统）、aideaWindow（窗口 chrome）、aideaFile（文件操作）。
 * 安全边界：只暴露契约白名单内方法，绝不暴露 ipcRenderer 本体或任何带路径参数的通道；
 * 类型标注对齐各 Bridge 接口，契约漂移会在 type-check 期暴露。
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { DesktopBridge, FileBridge, WindowBridge } from '../shared/bridge'
import { IPC } from '../shared/bridge'

const bridge: DesktopBridge = {
  kind: 'desktop',
  listPlugins: () => ipcRenderer.invoke(IPC.LIST),
  /** 返回取消订阅函数 */
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
  openProject: () => ipcRenderer.invoke(IPC.FILE_OPEN),
  saveProject: (opts) => ipcRenderer.invoke(IPC.FILE_SAVE, opts),
  writeFile: (opts) => ipcRenderer.invoke(IPC.FILE_WRITE, opts),
  readFile: (opts) => ipcRenderer.invoke(IPC.FILE_READ, opts),
}

const windowBridge: WindowBridge = {
  minimize: () => ipcRenderer.send(IPC.WINDOW_MINIMIZE),
  toggleMaximize: () => ipcRenderer.send(IPC.WINDOW_TOGGLE_MAXIMIZE),
  close: () => ipcRenderer.send(IPC.WINDOW_CLOSE),
  isMaximized: () => ipcRenderer.invoke(IPC.WINDOW_IS_MAXIMIZED),
  /** 返回取消订阅函数 */
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
