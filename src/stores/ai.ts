/**
 * aiConfig store - AI 调用配置持久化
 *
 * 用 useStorage 持久化到 localStorage('aidea-ai-config')，默认 AI_DEFAULT_CONFIG。
 * 提供 providerConfig() 把存量的 string|number 转成 AIProviderConfig（纯 number）。
 */
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { AI_DEFAULT_CONFIG } from '@/constants/ai'
import type { AIProviderConfig } from '@/provider/aiProvider'

export const useAIConfigStore = defineStore('aiConfig', () => {
  // ── State（localStorage 持久化） ──

  const baseURL = useStorage<string>('aidea-ai-config-baseURL', AI_DEFAULT_CONFIG.baseURL)
  const apiKey = useStorage<string>('aidea-ai-config-apiKey', AI_DEFAULT_CONFIG.apiKey)
  const model = useStorage<string>('aidea-ai-config-model', AI_DEFAULT_CONFIG.model)
  const timeoutMs = useStorage<number>('aidea-ai-config-timeoutMs', AI_DEFAULT_CONFIG.timeoutMs)
  const temperature = useStorage<number>('aidea-ai-config-temperature', AI_DEFAULT_CONFIG.temperature)

  /** 返回给 provider 的配置（把可能为 string 的值归一成 number） */
  function providerConfig(): AIProviderConfig {
    return {
      baseURL: baseURL.value,
      apiKey: apiKey.value,
      model: model.value,
      timeoutMs: toNumber(timeoutMs.value, AI_DEFAULT_CONFIG.timeoutMs),
    }
  }

  /** 重置为默认配置 */
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

/** 把 string|number 转成 number，NaN 时回退默认 */
function toNumber(value: string | number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}