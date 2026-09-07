/**
 * api/config.ts —— 插件配置域：插件自定义配置的持久化读写
 *
 * 面向插件的 data 段 api（命名空间即插件独立配置文件 `aidea-plugin-config.<pluginId>`）：
 * - get(key, fallback)：读配置值，键不存在（或无文件）返回 fallback；
 * - set(key, value)：写配置值（未知插件自动建文件；内存即改即写落盘，不入项目历史/undo）；
 * - remove(key)：删配置值；键不存在为 no-op。
 *
 * 与 additions 的区别：additions 是插件命名空间的项目级数据（随项目文件保存、随项目
 * 撤销）；config 是插件自身偏好（应用级独立存储，不随项目走、不入 undo）。
 * 仅经 adapter.for(pluginId) 的 PluginScope.config 提供（共享 PluginApi 无 config 域）。
 */
import { usePluginConfigStore } from '@/stores/pluginConfig'

/** 插件配置 api 工厂（闭包持有 pluginId，方法内部惰性 useStore） */
export function createPluginConfigApi(pluginId: string) {
  return {
    /** 读配置值；键不存在返回 fallback */
    get<T>(key: string, fallback: T): T {
      const value = usePluginConfigStore().getData(pluginId, key)
      return value === undefined ? fallback : (value as T)
    },
    /** 写配置值（即时持久化，不入项目历史） */
    set(key: string, value: unknown): void {
      usePluginConfigStore().setData(pluginId, key, value)
    },
    /** 删配置值；键不存在为 no-op */
    remove(key: string): void {
      usePluginConfigStore().removeData(pluginId, key)
    },
  }
}

/** 插件配置 api（get/set/remove 的命名空间包装） */
export type PluginConfigApi = ReturnType<typeof createPluginConfigApi>
