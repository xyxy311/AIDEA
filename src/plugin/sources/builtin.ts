/**
 * builtin.ts —— 内置插件源（随包分发，web 与桌面共用）
 *
 * 原 manager.ts 的编译期 glob 收集逻辑原样搬家：`import.meta.glob` 相对路径自本文件
 * 位置（src/plugin/sources/）多退一层指向仓库根 plugins/。loader 为惰性 `import`，
 * 与 Vue 组件一样受 dev HMR 监看。
 *
 * 本文件不 import manager.ts 的任何运行时导出（避免 manager → sources → manager
 * 运行时循环）；PluginEntry 类型经 type-only import 引用（编译期擦除，零运行时边）。
 */
import type { PluginEntry } from '../manager'

/** 从编译期路径推断插件 id：取 `…/<name>/index.ts` 中的 <name> */
export function pluginIdFromPath(path: string): string {
  const match = /([^/]+)\/index\.(ts|js|vue)$/.exec(path)
  return match ? match[1] : path
}

/**
 * 编译期 glob 收集仓库根 `plugins/**` 各内置插件入口，产出 `PluginEntry[]`。
 * source 标记由聚合层（sources/index.ts）统一填充，本源不感知来源裁决。
 */
export function collectBuiltinEntries(): PluginEntry[] {
  const modules = import.meta.glob('../../../plugins/**/index.{ts,js}')
  return Object.entries(modules).map(([path, loader]) => ({
    id: pluginIdFromPath(path),
    loader: loader as PluginEntry['loader'],
  }))
}
