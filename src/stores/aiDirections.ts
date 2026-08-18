/**
 * AI 发散方向 Store - 用户可配置的发散方向（标题 + 提示词）与默认方向
 *
 * 每个方向代表一种发散角度（如「为什么？」），对应的 prompt 作为发散指令拼入
 * 用户消息的「# 指令」段。数据通过 useStorage 持久化到 localStorage
 * （'bb-ai-directions' / 'bb-ai-default-direction'），属全局偏好，不随项目文件序列化。
 *
 * 两个固定的特殊方向：
 * - AI_DIRECTION_ANY（id='direction-any'，任意发散）：默认方向；基于上下文发散，prompt 无 ${from}
 * - AI_DIRECTION_FOCUS（id='direction-focus'，聚焦发散）：有起点但无具体角度
 * 它们的 id 必须稳定，其余预设（为什么等）用 nanoid 生成。
 *
 * 首次加载执行 initDefaults() 自愈：结构校验（每项含非空 string 的
 * id/title/prompt，id 兼做唯一健），JSON 解析失败或结构不符 → 删除坏文件
 * 回退默认；空列表用默认集合补初始化。
 */
import { computed } from 'vue'
import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import { useStorage } from '@vueuse/core'
import type { AIDivergenceDirection } from '@/types/ai'
import { DEFAULT_AI_DIRECTIONS, AI_DIRECTION_ANY, AI_DIRECTION_FOCUS } from '@/constants/ai'

/** localStorage 存储键：方向列表 */
const STORAGE_KEY = 'bb-ai-directions'
/** localStorage 存储键：默认方向 id */
const DEFAULT_DIRECTION_KEY = 'bb-ai-default-direction'
/** 默认发散方向 id（任意发散） */
const DEFAULT_DIRECTION_ID = 'direction-any'

/** 构造默认方向初始集：任意/聚焦用固定 id（保持 id 稳定），其余预设用 nanoid 补 id */
function buildDefaultDirections(): AIDivergenceDirection[] {
  const rest = DEFAULT_AI_DIRECTIONS.slice(2).map((d) => ({ ...d, id: nanoid() }))
  return [AI_DIRECTION_ANY, AI_DIRECTION_FOCUS, ...rest]
}

export const useAIDirectionsStore = defineStore('aiDirections', () => {
  // ── State（localStorage 持久化，方向有序列表 + 默认方向 id） ──

  const directions = useStorage<AIDivergenceDirection[]>(STORAGE_KEY, [])
  const defaultDirectionId = useStorage<string>(DEFAULT_DIRECTION_KEY, DEFAULT_DIRECTION_ID)

  // ── Getters ──

  /** 方向列表（有序） */
  const directionList = computed(() => directions.value)

  // ── 初始化自愈 ──

  /** 重置方向列表存储：删除损坏文件并回退为空列表 */
  function resetStorage(): void {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* 忽略清理失败 */
      console.error('Failed to remove localStorage item:', STORAGE_KEY)
    }
    directions.value = []
  }

  /** 同步把方向列表与默认方向写回 localStorage（useStorage 回写为异步 flush，此处确保落盘） */
  function syncWrite(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(directions.value))
    } catch {
      /* 忽略写入失败 */
    }
    try {
      localStorage.setItem(DEFAULT_DIRECTION_KEY, defaultDirectionId.value)
    } catch {
      /* 忽略写入失败 */
    }
  }

  /** 结构校验：每项含非空 string 的 id/title/prompt，且 id 唯一 */
  function isValidDirections(value: unknown): boolean {
    if (!Array.isArray(value)) return false
    const seen = new Set<string>()
    return value.every((item) => {
      if (!item || typeof item !== 'object') return false
      const o = item as Record<string, unknown>
      if (typeof o.id !== 'string' || o.id.length === 0) return false
      if (typeof o.title !== 'string' || o.title.length === 0) return false
      if (typeof o.prompt !== 'string' || o.prompt.length === 0) return false
      if (seen.has(o.id)) return false
      seen.add(o.id)
      return true
    })
  }

  /** 初始化自愈：校验结构，空列表时用默认方向补全 */
  function initDefaults(): void {
    // 读取并校验持久化数据；JSON 解析失败或结构不符 → 标记坏文件
    let bad = false
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw != null) {
        let parsed: unknown = null
        try {
          parsed = JSON.parse(raw)
        } catch {
          parsed = null
        }
        if (!isValidDirections(parsed)) bad = true
      }
    } catch {
      bad = true
    }

    if (bad) resetStorage()

    if (directions.value.length === 0) {
      directions.value = buildDefaultDirections()
    }

    syncWrite()
  }

  // ── CRUD ──

  /** 新增方向（追加到末尾），返回新项 */
  function addDirection(title: string, prompt: string, separator: string = ' '): AIDivergenceDirection {
    const item: AIDivergenceDirection = { id: nanoid(), title, prompt, separator }
    directions.value = [...directions.value, item]
    return item
  }

  /** 按 id 更新 title/prompt/separator */
  function updateDirection(
    id: string,
    updates: Partial<Pick<AIDivergenceDirection, 'title' | 'prompt' | 'separator'>>,
  ): void {
    const idx = directions.value.findIndex((d) => d.id === id)
    if (idx === -1) return
    const updated = [...directions.value]
    updated[idx] = { ...updated[idx], ...updates }
    directions.value = updated
  }

  /** 按 id 移除方向 */
  function deleteDirection(id: string): void {
    directions.value = directions.value.filter((d) => d.id !== id)
  }

  /** 拖拽排序：越界安全（fromIndex/toIndex 越界或相等时不变） */
  function reorderDirection(fromIndex: number, toIndex: number): void {
    const arr = [...directions.value]
    if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return
    if (fromIndex === toIndex) return
    const [moved] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, moved)
    directions.value = arr
  }

  // ── 默认发散方向 ──

  /** 设置默认方向 id（id 不在 directionList 中则忽略，不写入） */
  function setDefaultDirection(id: string): void {
    if (directionList.value.some((d) => d.id === id)) {
      defaultDirectionId.value = id
    }
  }

  /** 返回当前默认方向对象；若 defaultDirectionId 未命中方向列表则回退「任意发散」，保证生成逻辑永远有有效方向 */
  function getDefaultDirection(): AIDivergenceDirection {
    const hit = directionList.value.find((d) => d.id === defaultDirectionId.value)
    return hit ?? AI_DIRECTION_ANY
  }

  /** 恢复默认：删除两个存储键，方向重建为默认初始集，默认方向重置为任意发散，并同步落盘 */
  function resetToDefaults(): void {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* 忽略清理失败 */
    }
    try {
      localStorage.removeItem(DEFAULT_DIRECTION_KEY)
    } catch {
      /* 忽略清理失败 */
    }
    directions.value = buildDefaultDirections()
    defaultDirectionId.value = DEFAULT_DIRECTION_ID
    syncWrite()
  }

  // ── 初始化 ──

  initDefaults()

  return {
    directions,
    directionList,
    defaultDirectionId,
    addDirection,
    updateDirection,
    deleteDirection,
    reorderDirection,
    setDefaultDirection,
    getDefaultDirection,
    resetToDefaults,
  }
})