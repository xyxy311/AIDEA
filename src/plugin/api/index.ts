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

/** 构造分类好的应用 api（node / connection / tag / project / view） */
export function createPluginApi() {
  return {
    node: createNodeApi(),
    connection: createConnectionApi(),
    tag: createTagApi(),
    project: createProjectApi(),
    view: createViewApi(),
  }
}

export type PluginApi = ReturnType<typeof createPluginApi>

export { createNodeApi } from './node'
export { createConnectionApi } from './connection'
export { createTagApi } from './tag'
export { createProjectApi } from './project'
export { createViewApi } from './view'
export type { NodeApi } from './node'
export type { ConnectionApi } from './connection'
export type { TagApi } from './tag'
export type { ProjectApi } from './project'
export type { ViewApi } from './view'