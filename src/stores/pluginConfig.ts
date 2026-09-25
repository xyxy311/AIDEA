/**
 * pluginConfig —— 插件配置持久化（内存层，setup store）。借助 reactive Map 深度响应式，深度 watch 即改即写回 localStorage
 * （`aidea-plugin-config.` 前缀逐文件落盘）。data 段为插件自定义配置；shortcuts 段为插件快捷键用户覆盖（本 store 只路由，
 * 不依赖 shortcuts store 防环）。
 */
import { reactive, watch } from 'vue'
import { defineStore } from 'pinia'
import { readPluginConfig, writePluginConfig, type PluginConfigFile } from '@/utils/pluginConfig'

/** 配置存储 key 前缀（与 utils/pluginConfig 一致） */
const STORAGE_PREFIX = 'aidea-plugin-config.'

export const usePluginConfigStore = defineStore('pluginConfig', () => {
  /** 插件配置表：pluginId → 配置文件（深度响应式，即改即写） */
  const configs = reactive(new Map<string, PluginConfigFile>())

  // ── 启动加载：收集前缀 key 后全量读入（先收集再读，避免自愈 removeItem 影响遍历索引） ──
  {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(STORAGE_PREFIX) && k.length > STORAGE_PREFIX.length) keys.push(k)
    }
    for (const pluginId of keys.map((k) => k.slice(STORAGE_PREFIX.length))) {
      configs.set(pluginId, readPluginConfig(pluginId))
    }
  }

  // ── 即改即写：configs 任何变化（增删文件 / 深层字段变化）写回全部文件 ──
  // flush 用默认 'pre'（微任务内落盘），与 useStorage 的自动写回时机一致
  watch(
    configs,
    () => {
      for (const [pluginId, cfg] of configs) {
        writePluginConfig(pluginId, cfg)
      }
    },
    { deep: true },
  )

  /** 取某插件配置文件；不存在返回 undefined（只读场景不建文件） */
  function getConfigFile(pluginId: string): PluginConfigFile | undefined {
    return configs.get(pluginId)
  }

  /**
   * 取某插件配置文件；不存在自动建空文件（首次写入场景）。
   * 注意必须返回 configs.get(...) 的 reactive 代理——直接返回局部新建对象会绕开响应式
   * （后续对它的写入不触发深度 watch / bindings 重算）。
   */
  function ensureConfigFile(pluginId: string): PluginConfigFile {
    if (!configs.has(pluginId)) {
      configs.set(pluginId, { version: 1, data: {}, shortcuts: {} })
    }
    return configs.get(pluginId)!
  }

  // ── data 段（插件自定义配置） ──

  /** 读配置值；文件或键不存在返回 undefined */
  function getData(pluginId: string, key: string): unknown {
    return configs.get(pluginId)?.data[key]
  }

  /** 写配置值（未知插件自动建文件；reactive 深度写即改即写） */
  function setData(pluginId: string, key: string, value: unknown): void {
    ensureConfigFile(pluginId).data[key] = value
  }

  /** 删配置值；文件或键不存在为 no-op */
  function removeData(pluginId: string, key: string): void {
    delete configs.get(pluginId)?.data[key]
  }

  // ── shortcuts 段（插件快捷键动作的用户覆盖） ──

  /** 读某插件全部快捷键覆盖（key = 动作短 id → chord）；无文件返回空对象 */
  function getShortcutOverrides(pluginId: string): Record<string, string> {
    return configs.get(pluginId)?.shortcuts ?? {}
  }

  /** 写某插件单条快捷键覆盖（未知插件自动建文件） */
  function setShortcutOverride(pluginId: string, actionId: string, chord: string): void {
    ensureConfigFile(pluginId).shortcuts[actionId] = chord
  }

  /** 删某插件单条快捷键覆盖（reset 单个插件动作）；文件或键不存在为 no-op */
  function removeShortcutOverride(pluginId: string, actionId: string): void {
    delete configs.get(pluginId)?.shortcuts[actionId]
  }

  /** 清空快捷键覆盖：带参清该插件；无参清全部插件（resetAll 全量重置语义，含未启用插件） */
  function clearShortcutOverrides(pluginId?: string): void {
    if (pluginId !== undefined) {
      const cfg = configs.get(pluginId)
      if (cfg) cfg.shortcuts = {}
      return
    }
    for (const cfg of configs.values()) {
      cfg.shortcuts = {}
    }
  }

  return {
    configs,
    getConfigFile,
    getData,
    setData,
    removeData,
    getShortcutOverrides,
    setShortcutOverride,
    removeShortcutOverride,
    clearShortcutOverrides,
  }
})
