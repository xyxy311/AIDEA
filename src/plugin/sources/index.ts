/**
 * sources/index.ts —— 插件源聚合与互斥裁决（「加载收集唯一可变点」的收口）
 *
 * collectPluginEntries 按运行态二选一（互斥，蓝图 §4/红线 8），均为「应用启动时
 * 扫描/清单装载」，宿主构建不碰 plugins/ 内容：
 * - 桌面运行态（有桥）→ 桥扫描插件目录，经 aidea-plugin: 协议装载（desktop 源）；
 * - web 运行态（无桥）→ fetch 静态清单 /plugins/index.json，经根相对 URL 装载
 *   （web 源；web 形态的「目录扫描」等价物）。
 * - 防泄漏：manager.ts 只调本聚合函数，对源数量无感知；`if (electron)` 类分支
 *   只允许存在于 sources/ 内（未来加「远程插件源」= 在此加第三项，其他零改动；
 *   多源同 id 冲突时内置优先）。
 */
import { collectDesktopEntries, isDesktopRuntime } from './desktop'
import { collectWebEntries } from './web'
import type { PluginEntry } from '../manager'

// re-export 运行态探测与目录变更订阅（M2）：store 等消费方统一从 '@/plugin/sources'
// 取用，与 collectPluginEntries 同一路径习惯——desktop.ts 仍是全 renderer 唯一桥访问点
export { isDesktopRuntime, subscribePluginChanges } from './desktop'

export async function collectPluginEntries(): Promise<PluginEntry[]> {
  // 互斥聚合（蓝图 §4/红线 8）：有桥 → 仅桌面源（桥扫描目录 + 协议装载）；
  // 无桥 → 仅 web 静态清单源（fetch /plugins/index.json + 根相对 URL 装载）。
  // 两种形态均为启动时扫描/清单装载（编译期 glob 内置源已废除，宿主构建不碰 plugins/
  // 内容）。桌面下 IPC 失败 / web 下清单获取失败 → 对应源空集（不互相回退）。
  // 未来加「远程插件源」= 在此加第三项，多源同 id 冲突时内置优先（随包分发视为官方），
  // 其他零改动。
  if (isDesktopRuntime) return collectDesktopEntries()
  return collectWebEntries()
}
