/**
 * api/index.ts —— 应用 api 的组合与对外导出
 *
 * 分类 api 的类型全部**从实现派生**（`ReturnType<typeof createXxxApi>`），
 * 不手写接口，消除签名重复与双份维护成本。
 */
import { createNodeApi } from './node'
import { createConnectionApi } from './connection'
import { createTagApi } from './tag'
import { createProjectApi } from './project'
import { createViewApi } from './view'
import { createAdditionsApi } from './additions'
import { createPresetsApi } from './presets'
import { createThemeApi } from './theme'
import { createFileApi } from './file'
import { createShortcutsApi } from './shortcuts'

/**
 * 构造分类好的应用 api。已有域：node / connection / tag / project / view /
 * additions（共享只读域）；新增域：presets / theme / file / shortcuts。
 * （AI 功能已移除，未来迁移为内置插件，不再占用独立 api 域。）
 */
export function createPluginApi() {
  return {
    node: createNodeApi(),
    connection: createConnectionApi(),
    tag: createTagApi(),
    project: createProjectApi(),
    view: createViewApi(),
    additions: createAdditionsApi(null),
    presets: createPresetsApi(),
    theme: createThemeApi(),
    file: createFileApi(),
    shortcuts: createShortcutsApi(),
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