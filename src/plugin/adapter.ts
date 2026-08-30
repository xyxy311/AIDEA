/**
 * adapter.ts —— 插件适配层（稳定壳）
 *
 * 组装并导出最终 `PluginAdapter`。分类好的应用 api 在 `api.ts`（node / connection /
 * tag / stylePreset / project / view），本文件只装配并把它们重新导出。
 *
 * 插件经 `ctx.adapter.api` 这个唯一对象查询数据或执行命令，不再有命令表 / 命令类。
 */
import type { PluginAdapter } from '@/types'
import { SDK_VERSION } from '@/types'
import { createPluginApi } from './api'

/**
 * 组装最终适配层（插件唯一入口）。
 * 无需传插件 id——api 不携带命名空间；插件自身信息走 manifest。
 */
export function createPluginAdapter(): PluginAdapter {
  return {
    sdkVersion: SDK_VERSION,
    api: createPluginApi(),
  }
}

// ── 重新导出分类好的 api ──
export { createPluginApi } from './api'
export type { PluginApi, NodeApi, ConnectionApi, TagApi, StylePresetApi, ProjectApi, ViewApi } from '@/types'