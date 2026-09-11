/**
 * AI 发散方向 Store - 用户可配置的发散方向（标题 + 提示词）与默认方向
 *
 * 每个方向代表一种发散角度（如「为什么？」），对应的 prompt 作为发散指令拼入
 * 用户消息的「# 指令」段。插件化后持久化后端由原 useStorage localStorage
 * （'bb-ai-directions' / 'bb-ai-default-direction'）换成插件自身配置
 * scope.config（`aidea-plugin-config.ai` 的 data 段：directions / defaultDirectionId），
 * 仍属全局偏好，不随项目文件序列化。
 *
 * 两个固定的特殊方向：
 * - AI_DIRECTION_ANY（id='direction-any'，任意发散）：默认方向；基于上下文发散，prompt 无 ${from}
 * - AI_DIRECTION_FOCUS（id='direction-focus'，聚焦发散）：有起点但无具体角度
 * 它们的 id 必须稳定，其余预设（为什么等）用 nanoid 生成。
 *
 * 首次加载执行 initDefaults() 自愈：结构校验（每项含非空 string 的
 * id/title/prompt，id 兼做唯一健），结构不符 → 重置回默认；空列表用默认集合补初始化。
 * 另做一次性迁移：旧 localStorage 键存在且插件 config 无对应数据 → 搬入插件 config
 * 并删除旧键（坏 JSON 旧数据直接丢弃走默认初始化）。
 */
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import { adapter } from '@/plugin/adapter'
import type { AIDivergenceDirection } from '../types'
import { DEFAULT_AI_DIRECTIONS, AI_DIRECTION_ANY, AI_DIRECTION_FOCUS, AI_PLUGIN_ID } from '../constants'

/** 本插件命名空间作用域（for 有模块级缓存，与插件入口 setup 拿到同一实例） */
const scope = adapter.for(AI_PLUGIN_ID)

/** 插件配置 data 键：方向列表 */
const DIRECTIONS_KEY = 'directions'
/** 插件配置 data 键：默认方向 id */
const DEFAULT_DIRECTION_KEY = 'defaultDirectionId'
/** 默认发散方向 id（任意发散） */
const DEFAULT_DIRECTION_ID = 'direction-any'

/** 旧版主程序 localStorage 键：方向列表（迁移源） */
const LEGACY_STORAGE_KEY = 'bb-ai-directions'
/** 旧版主程序 localStorage 键：默认方向 id（迁移源） */
const LEGACY_DEFAULT_DIRECTION_KEY = 'bb-ai-default-direction'

/** 构造默认方向初始集：任意/聚焦用固定 id（保持 id 稳定），其余预设用 nanoid 补 id */
function buildDefaultDirections(): AIDivergenceDirection[] {
  const rest = DEFAULT_AI_DIRECTIONS.slice(2).map((d) => ({ ...d, id: nanoid() }))
  return [AI_DIRECTION_ANY, AI_DIRECTION_FOCUS, ...rest]
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

/** 读插件 config 的方向列表（结构不符回退空列表） */
function loadDirections(): AIDivergenceDirection[] {
  const stored: unknown = scope.config.get<unknown>(DIRECTIONS_KEY, undefined)
  return isValidDirections(stored) ? (stored as AIDivergenceDirection[]) : []
}

/** 读插件 config 的默认方向 id（非 string/空串回退任意发散） */
function loadDefaultDirectionId(): string {
  const stored = scope.config.get<unknown>(DEFAULT_DIRECTION_KEY, undefined)
  return typeof stored === 'string' && stored.length > 0 ? stored : DEFAULT_DIRECTION_ID
}

/**
 * 一次性迁移：旧 localStorage 键（bb-ai-*）→ 插件 config（data 段）。
 * - 插件 config 已有对应数据时不覆盖（尊重插件数据）；
 * - 旧方向列表经结构校验（坏 JSON / 结构不符直接丢弃走默认初始化）；
 * - 迁移后无条件删除两个旧键。幂等：旧键删除后再次执行直接跳过。
 */
function migrateLegacy(): void {
  const readLegacy = (key: string): string | null => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }
  const rawDirections = readLegacy(LEGACY_STORAGE_KEY)
  const rawDefault = readLegacy(LEGACY_DEFAULT_DIRECTION_KEY)
  if (rawDirections === null && rawDefault === null) return

  if (rawDirections !== null && scope.config.get<unknown>(DIRECTIONS_KEY, undefined) === undefined) {
    try {
      const parsed: unknown = JSON.parse(rawDirections)
      if (isValidDirections(parsed)) scope.config.set(DIRECTIONS_KEY, parsed)
    } catch {
      /* 坏 JSON：丢弃，走默认初始化 */
    }
  }
  if (
    rawDefault !== null &&
    rawDefault.length > 0 &&
    scope.config.get<unknown>(DEFAULT_DIRECTION_KEY, undefined) === undefined
  ) {
    scope.config.set(DEFAULT_DIRECTION_KEY, rawDefault)
  }

  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* 忽略清理失败 */
  }
  try {
    localStorage.removeItem(LEGACY_DEFAULT_DIRECTION_KEY)
  } catch {
    /* 忽略清理失败 */
  }
}

/**
 * AI 发散方向 store（pinia id 加 `ai:` 前缀，避免与迁移期主程序旧 store 同 id 冲突）。
 */
export const useAIDirectionsStore = defineStore('ai:aiDirections', () => {
  // 一次性迁移（旧键删除后不再进入）
  migrateLegacy()

  // ── State（插件 config 持久化：方向有序列表 + 默认方向 id） ──

  const directions = ref<AIDivergenceDirection[]>(loadDirections())
  const defaultDirectionId = ref<string>(loadDefaultDirectionId())

  // ── Getters ──

  /** 方向列表（有序） */
  const directionList = computed(() => directions.value)

  // ── 持久化 ──

  /** 写回插件 config（config.set 同步写内存，落盘由 pluginConfig 统一异步 flush） */
  function persist(): void {
    scope.config.set(DIRECTIONS_KEY, directions.value.map((d) => ({ ...d })))
    scope.config.set(DEFAULT_DIRECTION_KEY, defaultDirectionId.value)
  }

  // 任何变更（含测试直接赋值）自动写回插件 config
  watch([directions, defaultDirectionId], persist, { deep: true })

  // ── 初始化自愈 ──

  /** 初始化自愈：结构不符重置为空，空列表时用默认方向补全 */
  function initDefaults(): void {
    if (!isValidDirections(directions.value)) directions.value = []
    if (directions.value.length === 0) {
      directions.value = buildDefaultDirections()
    }
    persist()
  }

  // ── CRUD ──

  /** 新增方向（追加到末尾），返回新项 */
  function addDirection(title: string, prompt: string, separator: string = ' '): AIDivergenceDirection {
    const item: AIDivergenceDirection = { id: nanoid(), title, prompt, separator }
    directions.value = [...directions.value, item]
    persist()
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
    persist()
  }

  /** 按 id 移除方向 */
  function deleteDirection(id: string): void {
    directions.value = directions.value.filter((d) => d.id !== id)
    persist()
  }

  /** 拖拽排序：越界安全（fromIndex/toIndex 越界或相等时不变） */
  function reorderDirection(fromIndex: number, toIndex: number): void {
    const arr = [...directions.value]
    if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return
    if (fromIndex === toIndex) return
    const [moved] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, moved)
    directions.value = arr
    persist()
  }

  // ── 默认发散方向 ──

  /** 设置默认方向 id（id 不在 directionList 中则忽略，不写入） */
  function setDefaultDirection(id: string): void {
    if (directionList.value.some((d) => d.id === id)) {
      defaultDirectionId.value = id
      persist()
    }
  }

  /** 返回当前默认方向对象；若 defaultDirectionId 未命中方向列表则回退「任意发散」，保证生成逻辑永远有有效方向 */
  function getDefaultDirection(): AIDivergenceDirection {
    const hit = directionList.value.find((d) => d.id === defaultDirectionId.value)
    return hit ?? AI_DIRECTION_ANY
  }

  /** 恢复默认：方向重建为默认初始集、默认方向重置为任意发散，并同步写回插件 config */
  function resetToDefaults(): void {
    directions.value = buildDefaultDirections()
    defaultDirectionId.value = DEFAULT_DIRECTION_ID
    persist()
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
