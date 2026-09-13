/**
 * sources/index.ts —— 插件源聚合与 id 冲突裁决（「加载收集唯一可变点」的收口）
 *
 * collectPluginEntries = 内置源 ∪ 桌面本地源：
 * - 内置条目统一标记 `source: 'builtin'`（随包分发视为官方）；
 * - id 冲突裁决：本地与内置同 id → console.warn + 丢弃本地（内置优先）；
 * - 防泄漏：manager.ts 只调本聚合函数，对源数量无感知；`if (electron)` 类分支
 *   只允许存在于 sources/ 内（未来加「远程插件源」= 在此加第三项，其他零改动）。
 */
import { collectBuiltinEntries } from './builtin'
import { collectDesktopEntries } from './desktop'
import type { PluginEntry } from '../manager'

export async function collectPluginEntries(): Promise<PluginEntry[]> {
  const [builtin, local] = await Promise.all([collectBuiltinEntries(), collectDesktopEntries()])
  const builtinIds = new Set(builtin.map((e) => e.id))
  // 内置条目统一标 source（本地条目在 desktop 源已标 'local'）
  const merged: PluginEntry[] = builtin.map((e) => ({ ...e, source: 'builtin' as const }))
  for (const entry of local) {
    if (builtinIds.has(entry.id)) {
      console.warn(`[plugin] 本地插件 "${entry.id}" 与内置插件 id 冲突，忽略本地条目（内置优先）`)
      continue
    }
    merged.push(entry)
  }
  return merged
}
