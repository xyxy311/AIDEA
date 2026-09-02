/**
 * adapter.ts —— 插件适配层（稳定壳，插件对外唯一入口）
 *
 * 组装并导出最终 `PluginAdapter`：
 * - 分类好的应用 api 在 `./api/`（node / connection / tag / project / view），
 *   类型由实现派生；本文件只装配并在下方 re-export。
 * - 插件运行时契约类型（PluginAdapter / PluginContext / AideaPlugin）也定在这里，
 *   与实现型 api 类型聚于同一入口，插件统一从本文件导入。
 *
 * 插件经 `ctx.adapter.api` 这个唯一对象查询数据或执行命令，没有命令表 / 命令类。
 */
import type { PluginManifest } from '@/types'
import { SDK_VERSION } from '@/types/plugin'
import { createPluginApi } from './api'
import type { PluginApi } from './api'
import type { PluginUiApi } from './ui'

// ── 插件运行时契约（稳定）──

/** 插件的完整适配层（唯一入口，经 PluginContext.adapter 提供） */
export interface PluginAdapter {
  readonly sdkVersion: string
  /** 分类应用 api：查询 + 执行 */
  api: PluginApi
  /** 插件 UI 注册面（面板 / 顶栏按钮 / 设置栏目） */
  readonly ui: PluginUiApi
}

/** 插件 setup 上下文（插件唯一能触碰应用能力的方式） */
export interface PluginContext {
  /** 应用 api（唯一入口） */
  adapter: PluginAdapter
  /** 插件自身清单 */
  manifest: PluginManifest
  /** 卸载时让插件自清理副作用的出口 */
  onDispose(fn: () => void): void
}

/** 插件运行时模块：插件入口文件必须默认导出它 */
export interface AideaPlugin {
  manifest: PluginManifest
  /** 装载：拿到受限上下文，在此查询数据或执行命令 */
  setup: (ctx: PluginContext) => void
  /** 卸载：插件自清理副作用 */
  teardown?: () => void
}

/** 登记被拒的 UI 类型（用于共享实例的拒绝实现） */
type RejectedUi = '面板' | '顶栏按钮' | '设置栏目'

/**
 * 组装最终适配层（插件唯一入口）。
 * 共享实例的 api 不携带命名空间；ui 的注册面仅能在插件 setup(ctx) 内经
 * ctx.adapter.ui 使用（共享实例上的 ui 是拒绝实现，防止绕过上下文注册）。
 */
export function createPluginAdapter(): PluginAdapter {
  return {
    sdkVersion: SDK_VERSION,
    api: createPluginApi(),
    ui: createRejectedUi(),
  }
}

/** 共享适配层上的拒绝实现：提示 UI 注册仅能在插件 setup(ctx) 内使用 */
function createRejectedUi(): PluginUiApi {
  const warn = (kind: RejectedUi) => (): void => {
    console.warn(`[plugin] ${kind}注册仅可在插件 setup(ctx) 内经 ctx.adapter.ui 调用`)
  }
  return {
    registerPanel: warn('面板'),
    registerTopBarButton: warn('顶栏按钮'),
    registerSettingsCategory: warn('设置栏目'),
  }
}

// ── 重新导出（插件从这里取类型 / 工厂 / 版本）──
export { createPluginApi } from './api'
export type { PluginApi, NodeApi, ConnectionApi, TagApi, ProjectApi, ViewApi } from './api'
export type {
  PluginUiApi,
  PluginPanelRegistration,
  PluginTopBarButtonRegistration,
  PluginSettingsCategoryRegistration,
} from './ui'
export { SDK_VERSION } from '@/types/plugin'
export type { PluginManifest } from '@/types'