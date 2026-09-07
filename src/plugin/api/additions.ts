/**
 * api/additions.ts —— 插件项目级扩展数据（additions）域
 *
 * 职责：把 additionsStore 以**插件命名空间**形式暴露（仅经 adapter.for(pluginId) 的
 * PluginScope 提供；共享 PluginApi 上无 additions 域）。
 * - 读写自动加 `pluginId:` 前缀，插件只能碰自己的 key。
 *   key 中含 `:` → 抛错（禁止嵌套前缀越界，也不能伪造其他插件的命名空间）。
 *
 * 一次 set/remove = 单条历史（进 undo 且标 dirty）；多步合并请用
 * `adapter.api.project.beginBatch() / commitBatch()` 包裹。
 */
import { useAdditionsStore } from '@/stores/additions'
import { useHistoryStore } from '@/stores/history'
import { deepClone } from '@/utils/command'

export function createAdditionsApi(pluginId: string) {
  /** 归一化完整键：插件 key 加 `pluginId:` 前缀 */
  function scopedKey(key: string): string {
    if (key.includes(':')) {
      throw new Error(`additions 键不得含冒号（受限于插件命名空间前缀）：${key}`)
    }
    return `${pluginId}:${key}`
  }

  const api = {
    /** 读快照（深拷贝）；无对应加载函数 / 键不存在返回 undefined */
    get(key: string): unknown {
      return useAdditionsStore().get(scopedKey(key))
    },

    has(key: string): boolean {
      return useAdditionsStore().has(scopedKey(key))
    },

    /** 列出当前作用域的全部键（仅自己的 key，去掉前缀） */
    keys(): string[] {
      const prefix = `${pluginId}:`
      return useAdditionsStore()
        .keys()
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length))
    },

    /** 写入（深拷贝存值）；一次 set = 单条历史 */
    set(key: string, value: unknown): void {
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
