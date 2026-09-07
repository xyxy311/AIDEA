/**
 * adapter.ts —— 插件适配层（稳定壳，插件对外唯一入口）
 *
 * 组装并导出全局唯一 `adapter` 单例：
 * - 分类好的应用 api 在 `./api/`（node / connection / tag / project / view /
 *   presets / theme / file / shortcuts），类型由实现派生；本文件只装配并在下方 re-export。
 *   api 不含 additions（插件命名空间数据仅经 `for(id)` 的 PluginScope 提供）；
 *   shortcuts 仅只读查询（动作注册在 ctx.register.registerShortcutAction）。
 * - 插件命名空间能力经 `adapter.for(pluginId)` 获取：模块级 Map 缓存，同 id
 *   重复调用返回同一实例；AdditionsApi 闭包内才 useStore，模块加载期不触碰 pinia。
 * - 插件运行时契约类型（PluginAdapter / PluginContext / AideaPlugin）也定在这里，
 *   与实现型 api 类型聚于同一入口，插件统一从本文件导入。
 *
 * 数据操作：插件直接 `import { adapter }` 使用 `adapter.api`（共享，无命名空间）与
 * `adapter.for(id).additions`（插件专属前缀桶）；UI 注册不在 adapter 上——
 * setup(ctx) 经 ctx.register 进行（plugin/ui.ts）。
 *
 * SDK 通用 UI 组件：本文件同时 re-export 少量可复用 UI 组件（当前为
 * ShortcutActionRow——快捷键动作改键行），供插件设置栏目等场景直接使用。
 */
import type { PluginManifest } from '@/types'
import { SDK_VERSION } from '@/types/plugin'
import { createPluginApi } from './api'
import type { PluginApi } from './api'
import { createAdditionsApi } from './api/additions'
import type { AdditionsApi } from './api/additions'
import type { PluginRegisterApi } from './ui'

// ── 插件运行时契约（稳定）──

/** adapter.for(pluginId) 返回的插件命名空间能力（additions 内部自动拼 `${pluginId}:` 前缀） */
export interface PluginScope {
  /** 插件命名空间的 additions（内部自动拼 `${pluginId}:` 前缀，key 本身不得含冒号） */
  additions: AdditionsApi
}

/** 插件的完整适配层（全局唯一实例 `adapter`，插件直接 import 使用） */
export interface PluginAdapter {
  readonly sdkVersion: string
  /** 分类应用 api：查询 + 执行。不含 additions；shortcuts 仅只读查询（注册已移至 ctx.register） */
  api: PluginApi
  /** 作用域声明：返回该插件命名空间的能力（Map 缓存，重复调用同 id 返回同一实例） */
  for(pluginId: string): PluginScope
}

/** 插件 setup 上下文（注册面 + 清理出口；数据操作走全局 adapter） */
export interface PluginContext {
  /** 插件自身清单 */
  manifest: PluginManifest
  /** 卸载时让插件自清理副作用的出口 */
  onDispose(fn: () => void): void
  /** 注册面（面板 / 顶栏按钮 / 设置栏目 / 右键菜单项 / 快捷键动作），仅 setup 内使用 */
  register: PluginRegisterApi
}

/** 插件运行时模块：插件入口文件必须默认导出它 */
export interface AideaPlugin {
  manifest: PluginManifest
  /** 装载：拿到受限上下文，在此注册 UI；数据查询 / 命令经全局 adapter */
  setup: (ctx: PluginContext) => void
  /** 卸载：插件自清理副作用 */
  teardown?: () => void
}

// ── 作用域缓存（模块级：同 pluginId 全局共享同一 PluginScope 实例）──
const scopeCache = new Map<string, PluginScope>()

/** 校验插件 id（与 ui.ts 命名空间约束一致：非空且不含 ':'）；非法抛错 */
function requireValidPluginId(pluginId: string): void {
  if (typeof pluginId !== 'string' || pluginId.length === 0 || pluginId.includes(':')) {
    throw new Error(`adapter.for：插件 id 非法（须非空且不含 ':'）：${String(pluginId)}`)
  }
}

/**
 * 组装适配层（单例的构造细节；供模块顶层创建单例，测试亦可另建等价实例——
 * for 的作用域缓存为模块级，跨实例共享）。
 */
export function createPluginAdapter(): PluginAdapter {
  return {
    sdkVersion: SDK_VERSION,
    api: createPluginApi(),
    for(pluginId: string): PluginScope {
      requireValidPluginId(pluginId)
      const cached = scopeCache.get(pluginId)
      if (cached) return cached
      // 惰性：AdditionsApi 只创建闭包，方法体内才 useStore，此处不触碰任何 pinia store
      const scope: PluginScope = { additions: createAdditionsApi(pluginId) }
      scopeCache.set(pluginId, scope)
      return scope
    },
  }
}

/** 全局唯一适配层实例（插件直接 `import { adapter } from '@/plugin/adapter'` 使用） */
export const adapter: PluginAdapter = createPluginAdapter()

// ── 重新导出（插件从这里取类型 / 工厂 / 版本）──
export { createPluginApi } from './api'
export type {
  PluginApi,
  NodeApi,
  ConnectionApi,
  TagApi,
  ProjectApi,
  ViewApi,
  AdditionsApi,
  PresetsApi,
  ThemeApi,
  FileApi,
  ShortcutsApi,
} from './api'
export type {
  PluginRegisterApi,
  PluginPanelRegistration,
  PluginTopBarButtonRegistration,
  PluginSettingsCategoryRegistration,
  PluginShortcutActionRegistration,
  PluginContextMenuItemRegistration,
} from './ui'
export { SDK_VERSION } from '@/types/plugin'
export type { PluginManifest } from '@/types'

// ── SDK 通用 UI 组件（供插件复用；首个：快捷键动作改键行）──
export { default as ShortcutActionRow } from '@/components/common/ShortcutActionRow.vue'
