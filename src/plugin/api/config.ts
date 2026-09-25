/**
 * api/config.ts —— 插件配置域：插件自定义配置（应用级独立存储，不随项目走、不入 undo，
 * 命名空间即插件独立配置文件 `aidea-plugin-config.<pluginId>`）。
 * 仅经 adapter.for(pluginId) 的 PluginScope.config 提供；get/set/remove，键不存在为 no-op。
 */
import { usePluginConfigStore } from '@/stores/pluginConfig'

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
