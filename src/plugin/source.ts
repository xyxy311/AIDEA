/**
 * source.ts —— PluginSource（加载方式接口）+ StaticPluginSource（当前编译期实现）
 *
 * 这是「可变层」，唯一包装"插件代码从哪来"。当前用 Vite `import.meta.glob` 在**编译期**
 * 收集 `./plugins/**`，未来切 Electron 等桌面端、或需要用户现场添加插件时，只需新增一个
 * `RuntimePluginSource` 并替换注入，上层（adapter / api / 生命周期）零改动。
 */
import type { AideaPlugin } from './adapter'

/** 单个待装载插件：id（manifest 路由键）+ loader（取插件模块） */
export interface PluginSourceEntry {
  id: string
  loader: () => Promise<{ default?: AideaPlugin; [k: string]: unknown }>
}

/** 加载方式接口（可变层唯一抽象）。PluginManager 只依赖它。 */
export interface PluginSource {
  /** 扫描"可发现"的插件清单（含未启用的），为 PluginManager 提供候选 */
  list(): PluginSourceEntry[]
}

/** 从编译期路径推断插件 id：取 `…/<name>/index.ts` 中的 <name> */
export function pluginIdFromPath(path: string): string {
  const match = /([^/]+)\/index\.(ts|js|vue)$/.exec(path)
  return match ? match[1] : path
}

/**
 * StaticPluginSource（当前）：Vite 编译期内置加载。
 * `import.meta.glob` 在编译期收集 `./plugins/**` 各插件入口，loader 惰性 `import` 对应模块；
 * 与 Vue 组件一样受 dev HMR 监看，改动自动生效。
 */
export class StaticPluginSource implements PluginSource {
  private readonly modules = import.meta.glob('../../plugins/**/index.{ts,js}')

  list(): PluginSourceEntry[] {
    return Object.entries(this.modules).map(([path, loader]) => ({
      id: pluginIdFromPath(path),
      loader: loader as () => Promise<{ default?: AideaPlugin; [k: string]: unknown }>,
    }))
  }
}