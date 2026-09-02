/**
 * api/additions.ts —— 插件项目级扩展数据（additions）域
 *
 * 职责：把 additionsStore 暴露给插件。
 * - ownerId 非空（插件上下文）：读写自动加 `pluginId:` 前缀，插件只能碰自己的 key。
 *   key 中含 `:` → 抛错（禁止嵌套前缀越界，也不能伪造其他插件的命名空间）。
 * - ownerId 为 null（共享只读 api）：仅暴露只读方法，写方法抛错——
 *   additions 写操作只允许在插件上下文（有 ownerId 前缀桶）中调用。
 *
 * 一次 set/remove = 单条历史（进 undo 且标 dirty）；多步合并请用
 * `api.project.beginBatch() / commitBatch()` 包裹。
 */
import { useAdditionsStore } from '@/stores/additions'
import { useHistoryStore } from '@/stores/history'
import { deepClone } from '@/utils/command'

export function createAdditionsApi(ownerId: string | null) {
  /** 共享只读 api 用的哨兵：写操作不可用 */
  const readonly = ownerId === null

  /** 归一化完整键：插件 key 加 `pluginId:` 前缀；只读 api 原样返回 */
  function scopedKey(key: string): string {
    if (readonly) return key
    if (key.includes(':')) {
      throw new Error(`additions 键不得含冒号（受限于插件命名空间前缀）：${key}`)
    }
    return `${ownerId}:${key}`
  }

  const api = {
    /** 读快照（深拷贝）；无对应加载函数 / 键不存在返回 undefined */
    get(key: string): unknown {
      return useAdditionsStore().get(scopedKey(key))
    },

    has(key: string): boolean {
      return useAdditionsStore().has(scopedKey(key))
    },

    /** 列出当前作用域的全部键（插件：仅自己的 key，去掉前缀；共享：原样全量） */
    keys(): string[] {
      const store = useAdditionsStore()
      if (readonly) return store.keys()
      const prefix = `${ownerId}:`
      return store
        .keys()
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length))
    },

    /** 写入（深拷贝存值）；一次 set = 单条历史 */
    set(key: string, value: unknown): void {
      if (readonly) {
        throw new Error('additions 写操作仅可在插件上下文中经 ctx.adapter.api.additions 调用')
      }
      const store = useAdditionsStore()
      const full = scopedKey(key)
      const old = store.get(full)
      store.applyValue(full, value)
      useHistoryStore().pushCommand({
        nodeChanges: [],
        connChanges: [],
        additionsChanges: [{ type: 'set', key: full, old, new: deepClone(value) }],
      })
    },

    /** 删除；键原本不存在则直接返回（不产生历史） */
    remove(key: string): void {
      if (readonly) {
        throw new Error('additions 写操作仅可在插件上下文中经 ctx.adapter.api.additions 调用')
      }
      const store = useAdditionsStore()
      const full = scopedKey(key)
      const old = store.get(full)
      if (old === undefined) return
      store.applyValue(full, undefined)
      useHistoryStore().pushCommand({
        nodeChanges: [],
        connChanges: [],
        additionsChanges: [{ type: 'remove', key: full, old }],
      })
    },
  }

  return api
}

export type AdditionsApi = ReturnType<typeof createAdditionsApi>