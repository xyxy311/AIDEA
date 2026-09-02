import { reactive } from 'vue'
import { defineStore } from 'pinia'
import { deepClone } from '@/utils/command'

/** 归一化完整键的前缀契约：`${pluginId}:${key}`，插件键必须带 `pluginId:` 前缀才能落盘 */
const KEY_PREFIX = /^[^:]+:/

/**
 * additions Store —— 项目级插件扩展数据的单一数据源
 *
 * 设计要点：
 * - 顶层键值对（归一化完整键 `pluginId:key`），值与节点/连线完全隔离。
 * - 用 reactive(Map) 沿用 nodeStore 惯例，保持深度响应式。
 * - `applyValue` 是 history undo/redo 直接调用的底层写入：
 *   只改数据、**不经命令层、不入栈、不标 dirty**（由 pushCommand 完成）。
 * - 写操作唯一入口在 api（additions.set/remove 经 useHistoryStore().pushCommand 入栈）。
 */
export const useAdditionsStore = defineStore('additions', () => {
  // ── State ──

  /** 全部扩展数据：Map<归一化完整键, 值> */
  const entries = reactive(new Map<string, unknown>())

  // ── 内部操作 ──

  /** 整体替换（新建 / 打开项目时载入）。仅保留匹配 `<pluginId>:` 前缀的键，值深拷贝。 */
  function load(data: Record<string, unknown> | undefined): void {
    entries.clear()
    if (!data || typeof data !== 'object') return
    for (const key of Object.keys(data)) {
      if (KEY_PREFIX.test(key)) {
        entries.set(key, deepClone(data[key]))
      }
    }
  }

  /** 底层单键写入：value === undefined → 删除；否则深拷贝写入。history undo/redo 直接调用。 */
  function applyValue(key: string, value: unknown): void {
    if (value === undefined) {
      entries.delete(key)
    } else {
      entries.set(key, deepClone(value))
    }
  }

  /** 读快照（深拷贝，不跨作用域引用内部 reactive） */
  function get(key: string): unknown {
    const v = entries.get(key)
    return v === undefined ? undefined : deepClone(v)
  }

  function has(key: string): boolean {
    return entries.has(key)
  }

  function keys(): string[] {
    return Array.from(entries.keys())
  }

  /** 全键值深拷贝导出（保存项目用） */
  function serialize(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of entries) {
      out[key] = deepClone(value)
    }
    return out
  }

  /** 清空（新建项目 / 打开项目前） */
  function clear(): void {
    entries.clear()
  }

  return {
    entries,
    load,
    applyValue,
    get,
    has,
    keys,
    serialize,
    clear,
  }
})