/**
 * aiConfig store - AI 调用配置持久化（插件版，迁自 src/stores/ai.ts 改造）
 *
 * 原主程序版经 useStorage 直写 localStorage('aidea-ai-config-*') 五个键；插件化后
 * 持久化后端换成插件自身配置：scope.config（`aidea-plugin-config.ai` 的 data 段），
 * 整包对象存 data.connection（即时持久化、不入项目历史/undo，应用级偏好语义不变）。
 *
 * 不做旧版兼容：旧版主程序 localStorage 键（aidea-ai-config-*）不迁移、不读取；
 * 插件 config 无已有数据时直接使用内置默认值（AI_DEFAULT_CONFIG）。
 * 其余逻辑（默认值、providerConfig 组装 provider 配置、重置默认）与原版一致。
 */
import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { adapter } from '@/plugin/adapter'
import { AI_DEFAULT_CONFIG, AI_PLUGIN_ID } from '../constants'
import type { AIProviderConfig } from '../provider/aiProvider'

/** 本插件命名空间作用域（for 有模块级缓存，与插件入口 setup 拿到同一实例） */
const scope = adapter.for(AI_PLUGIN_ID)

/** 连接配置（持久化整包对象：data.connection） */
interface AIConnectionConfig {
  baseURL: string
  apiKey: string
  model: string
  timeoutMs: number
  temperature: number
}

/** 插件配置 data 键：连接配置整包 */
const CONNECTION_KEY = 'connection'

/** string 字段归一：非 string 回退默认 */
function toStr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

/** string|number → number，NaN 时回退默认 */
function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * AI 连接配置 store（pinia id 加 `ai:` 前缀，避免与主程序或其他插件 store 同 id 冲突）。
 */
export const useAIConfigStore = defineStore('ai:aiConfig', () => {
  // ── State（插件 config 持久化的整包连接配置 → 拆为可写字段） ──

  const stored = scope.config.get<Partial<AIConnectionConfig>>(CONNECTION_KEY, {})

  const baseURL = ref(toStr(stored.baseURL, AI_DEFAULT_CONFIG.baseURL))
  const apiKey = ref(toStr(stored.apiKey, AI_DEFAULT_CONFIG.apiKey))
  const model = ref(toStr(stored.model, AI_DEFAULT_CONFIG.model))
  const timeoutMs = ref(toNumber(stored.timeoutMs, AI_DEFAULT_CONFIG.timeoutMs))
  const temperature = ref(toNumber(stored.temperature, AI_DEFAULT_CONFIG.temperature))

  /** 组装当前整包配置 */
  function snapshot(): AIConnectionConfig {
    return {
      baseURL: baseURL.value,
      apiKey: apiKey.value,
      model: model.value,
      timeoutMs: timeoutMs.value,
      temperature: temperature.value,
    }
  }

  // 字段任一变化 → 整包写回插件 config（即时持久化，不入项目历史）
  watch([baseURL, apiKey, model, timeoutMs, temperature], () => {
    scope.config.set(CONNECTION_KEY, snapshot())
  })

  /** 返回给 provider 的配置（把可能为 string 的值归一成 number） */
  function providerConfig(): AIProviderConfig {
    return {
      baseURL: baseURL.value,
      apiKey: apiKey.value,
      model: model.value,
      timeoutMs: toNumber(timeoutMs.value, AI_DEFAULT_CONFIG.timeoutMs),
    }
  }

  /** 重置为默认配置（watch 自动写回插件 config） */
  function resetToDefaults(): void {
    baseURL.value = AI_DEFAULT_CONFIG.baseURL
    apiKey.value = AI_DEFAULT_CONFIG.apiKey
    model.value = AI_DEFAULT_CONFIG.model
    timeoutMs.value = AI_DEFAULT_CONFIG.timeoutMs
    temperature.value = AI_DEFAULT_CONFIG.temperature
  }

  return {
    baseURL,
    apiKey,
    model,
    timeoutMs,
    temperature,
    providerConfig,
    resetToDefaults,
  }
})
