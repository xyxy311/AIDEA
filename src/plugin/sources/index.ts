/**
 * sources/index.ts —— 插件源聚合收口。
 * 纯 Electron 桌面形态：经 Electron 桥扫描插件目录、以 aidea-plugin: 协议装载。
 * manager.ts 只调本聚合函数，对源内部实现无感知；未来加远程源只需在此加第二项。
 */
import { collectDesktopEntries } from './desktop'
import type { PluginEntry } from '../manager'

// re-export 插件目录变更订阅，消费方统一从 '@/plugin/sources' 取用
export { subscribePluginChanges } from './desktop'

export async function collectPluginEntries(): Promise<PluginEntry[]> {
  // 纯桌面形态：应用启动时经桥扫描插件目录 + 协议装载；IPC 失败 → 空集兜底
  return collectDesktopEntries()
}