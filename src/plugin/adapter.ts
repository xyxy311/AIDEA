/**
 * adapter.ts —— 插件适配层（稳定壳，插件对外唯一入口）。
 * - 分类应用 api 在 ./api/，本文件只装配并 re-export；api 不含 additions 与 config（插件
 *   命名空间能力仅经 `for(id)` 的 PluginScope 提供）。
 * - `adapter.for(pluginId)`：模块级 Map 缓存，同 id 返回同一实例；AdditionsApi / ConfigApi /
 *   ModalApi 闭包内才 useStore，模块加载期不触碰 pinia。
 * - 数据操作：`adapter.api`（共享）、`adapter.for(id).additions/config/modal/floating`（命名空间）；
 *   UI 注册经 setup(ctx).register（plugin/ui.ts）。
 * - 同文件 re-export 少量 SDK 通用 UI 组件（ShortcutActionRow / DraggableSortList）与共享样式。
 */
import type { PluginManifest } from '@/types'
import { SDK_VERSION } from '@/types/plugin'
import { createPluginApi } from './api'
import type { PluginApi } from './api'
import { createAdditionsApi } from './api/additions'
import type { AdditionsApi } from './api/additions'
import { createPluginConfigApi } from './api/config'
import type { PluginConfigApi } from './api/config'
import { createPluginModalApi, createPluginFloatingApi } from './ui'
import type { PluginRegisterApi, PluginModalApi, PluginFloatingApi } from './ui'

// ── 插件运行时契约（稳定）──

/** adapter.for(pluginId) 返回的插件命名空间能力（additions / modal / floating 内部自动拼 `${pluginId}:` 前缀；config 绑定插件独立配置文件） */
export interface PluginScope {
  /** 插件命名空间的 additions（内部自动拼 `${pluginId}:` 前缀，key 本身不得含冒号） */
  additions: AdditionsApi
  /** 插件自身配置（`aidea-plugin-config.<pluginId>` 的 data 段，get/set/remove，即时持久化） */
  config: PluginConfigApi
  /** 本插件登记的模态运行时（open 收插件内短 id，内部拼 `${pluginId}:${id}`；与 ctx.modal 同工厂） */
  modal: PluginModalApi
  /** 本插件登记的浮动层运行时（open/close/toggle/isVisible 收插件内短 id；与 ctx.floating 同工厂） */
  floating: PluginFloatingApi
}

/** 插件的完整适配层（全局唯一实例 `adapter`，插件直接 import 使用） */
export interface PluginAdapter {
  readonly sdkVersion: string
  /** 分类应用 api：查询 + 执行。不含 additions；shortcuts 仅只读查询（注册已移至 ctx.register） */
  api: PluginApi
  /** 作用域声明：返回该插件命名空间的能力（Map 缓存，重复调用同 id 返回同一实例） */
  for(pluginId: string): PluginScope
}

/** 插件 setup 上下文（注册面 + 模态/浮动层运行时 + 清理出口；数据操作走全局 adapter） */
export interface PluginContext {
  /** 插件自身清单 */
  manifest: PluginManifest
  /** 卸载时让插件自清理副作用的出口 */
  onDispose(fn: () => void): void
  /** 注册面（面板 / 顶栏按钮 / 设置栏目 / 右键菜单项 / 快捷键动作 / 模态面板 / 浮动层），仅 setup 内使用 */
  register: PluginRegisterApi
  /** 模态运行时：open 收本插件登记的短 id（内部拼 `${pluginId}:${id}`），close 关闭当前模态 */
  modal: PluginModalApi
  /** 浮动层运行时：open/close/toggle/isVisible 收本插件登记的短 id（内部拼 `${pluginId}:${id}`） */
  floating: PluginFloatingApi
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
      // 惰性：AdditionsApi / ConfigApi / ModalApi / FloatingApi 只创建闭包（modal/floating
      // 工厂方法体内才 useStore），此处不触碰任何 pinia store
      const scope: PluginScope = {
        additions: createAdditionsApi(pluginId),
        config: createPluginConfigApi(pluginId),
        modal: createPluginModalApi(pluginId),
        floating: createPluginFloatingApi(pluginId),
      }
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
  FsApi,
} from './api'
export type { PluginConfigApi } from './api/config'
export type {
  PluginRegisterApi,
  PluginModalApi,
  PluginFloatingApi,
  PluginPanelRegistration,
  PluginTopBarButtonRegistration,
  PluginSettingsCategoryRegistration,
  PluginShortcutActionRegistration,
  PluginContextMenuItemRegistration,
  PluginContextMenuChildItem,
  PluginFloatingLayerRegistration,
} from './ui'
export { SDK_VERSION } from '@/types/plugin'
// SDK re-export 类型清单：插件经此处取数据结构，不直接依赖 @/types 内部路径
export type { PluginManifest, WhiteboardNode } from '@/types'

// ── SDK 通用 UI 组件与共享样式（供插件复用）──
// SDK 组件配套的设置区共享样式由 SDK 入口统一注入：插件 import adapter 即获得，
// 插件侧不得复制样式副本或另引主应用样式路径
import '@/components/settings/settings-shared.css'
export { default as ShortcutActionRow } from '@/components/common/ShortcutActionRow.vue'
export { default as DraggableSortList } from '@/components/common/DraggableSortList.vue'
