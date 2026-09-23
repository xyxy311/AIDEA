/**
 * sources/index.ts —— 插件源聚合收口
 *
 * 项目已收敛为纯 Electron 桌面形态（web 静态清单源已删除）：插件一律经
 * Electron 桥扫描插件目录、以 aidea-plugin: 协议装载（见 ./desktop，全
 * renderer 唯一的 window.aideaDesktop 桥访问点）。manager.ts 只调本聚合函数，
 * 对源内部实现无感知；未来加「远程插件源」= 在此加第二项，多源同 id 冲突时
 * 内置优先，其他零改动。
 */
import { collectDesktopEntries } from './desktop'
import type { PluginEntry } from '../manager'

// re-export 插件目录变更订阅（M2）：消费方统一从 '@/plugin/sources' 取用，
// desktop.ts 仍是全 renderer 唯一桥访问点。
export { subscribePluginChanges } from './desktop'

export async function collectPluginEntries(): Promise<PluginEntry[]> {
  // 纯桌面形态：应用启动时经桥扫描插件目录 + 协议装载（宿主构建不碰 plugins/ 内容）。
  // IPC 失败 → 桌面源空集兜底（不互相回退），见 ./desktop。
  return collectDesktopEntries()
}