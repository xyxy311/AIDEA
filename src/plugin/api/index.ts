/**
 * api/index.ts —— 应用 api 的组合与对外导出
 * 各分类 api 类型从实现派生（ReturnType<typeof createXxxApi>），不手写接口。
 */
import { createNodeApi } from './node'
import { createConnectionApi } from './connection'
import { createTagApi } from './tag'
import { createProjectApi } from './project'
import { createViewApi } from './view'
import { createPresetsApi } from './presets'
import { createThemeApi } from './theme'
import { createFileApi } from './file'
import { createShortcutsApi } from './shortcuts'
import { createI18nApi } from './i18n'

/**
 * 构造分类好的应用 api：node / connection / tag / project / view / presets / theme / file / shortcuts / i18n。
 * additions 移出共享 api（插件命名空间数据仅经 adapter.for(id).additions）；shortcuts 动作注册已移至 ctx.register。
 * AI 功能已移除，未来迁移为内置插件。
 */
export function createPluginApi() {
  return {
    node: createNodeApi(),
    connection: createConnectionApi(),
    tag: createTagApi(),
    project: createProjectApi(),
    view: createViewApi(),
    presets: createPresetsApi(),
    theme: createThemeApi(),
    file: createFileApi(),
    shortcuts: createShortcutsApi(),
    i18n: createI18nApi(),
  }
}

export type PluginApi = ReturnType<typeof createPluginApi>

export { createNodeApi } from './node'
export { createConnectionApi } from './connection'
export { createTagApi } from './tag'
export { createProjectApi } from './project'
export { createViewApi } from './view'
export { createAdditionsApi } from './additions'
export { createPresetsApi } from './presets'
export { createThemeApi } from './theme'
export { createFileApi } from './file'
export { createShortcutsApi } from './shortcuts'
export { createI18nApi } from './i18n'
export type { NodeApi } from './node'
export type { ConnectionApi } from './connection'
export type { TagApi } from './tag'
export type { ProjectApi } from './project'
export type { ViewApi } from './view'
export type { AdditionsApi } from './additions'
export type { PresetsApi } from './presets'
export type { ThemeApi } from './theme'
export type { FileApi } from './file'
export type { ShortcutsApi } from './shortcuts'
export type { I18nApi } from './i18n'