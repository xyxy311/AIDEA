/**
 * preload/index.ts —— contextBridge 窄桥：window.aideaDesktop。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §3 与 electron/shared/bridge.ts 的 DesktopBridge 契约。
 *
 * 安全边界（红线 2）：只暴露契约白名单内的两个方法；绝不暴露 fs/path/shell/dialog、
 * 任何携带路径参数的通道、ipcRenderer 本体。形状用 satisfies 对齐 DesktopBridge，
 * 契约漂移（字段改名/签名变化）会在 type-check 期暴露。
 *
 * sandbox: true 下 preload 以受限 CJS 运行，只能 require('electron') 的白名单模块
 * （contextBridge/ipcRenderer 等）；esbuild external: ['electron'] 保证运行时 require，
 * shared/bridge.ts（纯常量与类型）可安全被打进产物。
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { DesktopBridge } from '../shared/bridge'
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

contextBridge.exposeInMainWorld('aideaDesktop', bridge)
