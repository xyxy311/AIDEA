import { describe, it, expect, beforeEach } from 'vitest'
import {
  readPluginConfig,
  writePluginConfig,
  migrateShortcutOverrides,
  type PluginConfigFile,
} from '@/utils/pluginConfig'

/** 清理本模块涉及的 localStorage 文件 */
function clearAll(): void {
  localStorage.removeItem('aidea-shortcuts')
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('aidea-plugin-config.')) keys.push(k)
  }
  for (const k of keys) localStorage.removeItem(k)
}

describe('utils/pluginConfig', () => {
  beforeEach(clearAll)

  describe('readPluginConfig（自愈）', () => {
    it('文件缺失回退空文件', () => {
      expect(readPluginConfig('nope')).toEqual({ version: 1, data: {}, shortcuts: {} })
      // 只读不建文件
      expect(localStorage.getItem('aidea-plugin-config.nope')).toBeNull()
    })

    it('合法文件原样读出', () => {
      const file: PluginConfigFile = { version: 1, data: { k: 1 }, shortcuts: { act: 'j' } }
      writePluginConfig('demo', file)
      expect(readPluginConfig('demo')).toEqual(file)
    })

    it('坏 JSON：删除坏文件并回退空文件', () => {
      localStorage.setItem('aidea-plugin-config.demo', '{oops')
      expect(readPluginConfig('demo')).toEqual({ version: 1, data: {}, shortcuts: {} })
      expect(localStorage.getItem('aidea-plugin-config.demo')).toBeNull() // 坏文件被自愈删除
    })

    it('结构不符（version 错）：删除并回退空文件', () => {
      localStorage.setItem('aidea-plugin-config.demo', JSON.stringify({ version: 2, data: {}, shortcuts: {} }))
      expect(readPluginConfig('demo')).toEqual({ version: 1, data: {}, shortcuts: {} })
      expect(localStorage.getItem('aidea-plugin-config.demo')).toBeNull()
    })

    it('结构不符（data/shortcuts 为数组）：删除并回退空文件', () => {
      localStorage.setItem(
        'aidea-plugin-config.demo',
        JSON.stringify({ version: 1, data: [], shortcuts: {} }),
      )
      expect(readPluginConfig('demo')).toEqual({ version: 1, data: {}, shortcuts: {} })
      expect(localStorage.getItem('aidea-plugin-config.demo')).toBeNull()
    })

    it('结构不符（shortcuts 值非 string）：删除并回退空文件', () => {
      localStorage.setItem(
        'aidea-plugin-config.demo',
        JSON.stringify({ version: 1, data: {}, shortcuts: { act: 3 } }),
      )
      expect(readPluginConfig('demo')).toEqual({ version: 1, data: {}, shortcuts: {} })
      expect(localStorage.getItem('aidea-plugin-config.demo')).toBeNull()
    })
  })

  describe('migrateShortcutOverrides（存量迁移）', () => {
    it('拆分：含 ":" 条目按首个 ":" 进对应插件文件，内置条目留原处', () => {
      localStorage.setItem(
        'aidea-shortcuts',
        JSON.stringify({ 'demo:act': 'j', 'demo:act:sub': 'k', save: 'mod+shift+s' }),
      )
      migrateShortcutOverrides()
      // demo:act → { act: 'j' }；demo:act:sub → { act: { sub... } 归为 actionId 'act:sub' }
      expect(JSON.parse(localStorage.getItem('aidea-plugin-config.demo')!).shortcuts).toEqual({
        act: 'j',
        'act:sub': 'k',
      })
      expect(JSON.parse(localStorage.getItem('aidea-shortcuts')!)).toEqual({ save: 'mod+shift+s' })
    })

    it('多插件分别落各自文件；空 pluginId（:开头）视为非法留在裁剪集', () => {
      localStorage.setItem(
        'aidea-shortcuts',
        JSON.stringify({ 'demo:act': 'j', 'other:act': 'k', ':bare': 'x' }),
      )
      migrateShortcutOverrides()
      expect(JSON.parse(localStorage.getItem('aidea-plugin-config.demo')!).shortcuts).toEqual({ act: 'j' })
      expect(JSON.parse(localStorage.getItem('aidea-plugin-config.other')!).shortcuts).toEqual({ act: 'k' })
      // ':bare' 拆分 idx=0 不满足 idx>0 → 留在裁剪集
      expect(JSON.parse(localStorage.getItem('aidea-shortcuts')!)).toEqual({ ':bare': 'x' })
    })

    it('合并：迁移值优先，插件文件已有 shortcuts 条目保留（不冲突时）', () => {
      localStorage.setItem('aidea-plugin-config.demo', JSON.stringify({ version: 1, data: {}, shortcuts: { act: 'old' } }))
      localStorage.setItem('aidea-shortcuts', JSON.stringify({ 'demo:act': 'new', 'demo:extra': 'e' }))
      migrateShortcutOverrides()
      expect(JSON.parse(localStorage.getItem('aidea-plugin-config.demo')!).shortcuts).toEqual({
        act: 'new', // 迁移值优先
        extra: 'e',
      })
    })

    it('幂等：重复迁移无副作用（第二次为 no-op 等价）', () => {
      localStorage.setItem('aidea-shortcuts', JSON.stringify({ 'demo:act': 'j', save: 'mod+shift+s' }))
      migrateShortcutOverrides()
      const after1 = localStorage.getItem('aidea-plugin-config.demo')
      const legacy1 = localStorage.getItem('aidea-shortcuts')
      migrateShortcutOverrides()
      expect(localStorage.getItem('aidea-plugin-config.demo')).toBe(after1)
      expect(localStorage.getItem('aidea-shortcuts')).toBe(legacy1)
    })

    it('无旧文件不凭空创建 aidea-shortcuts；坏 JSON 写回空对象自愈', () => {
      // 场景 1：无旧文件 → 不写回
      migrateShortcutOverrides()
      expect(localStorage.getItem('aidea-shortcuts')).toBeNull()
      // 场景 2：坏 JSON → 按空处理，写回 '{}'（自愈）
      localStorage.setItem('aidea-shortcuts', '{oops')
      migrateShortcutOverrides()
      expect(JSON.parse(localStorage.getItem('aidea-shortcuts')!)).toEqual({})
      // 迁移源为空 → 无插件文件产生
      expect(localStorage.getItem('aidea-plugin-config.demo')).toBeNull()
    })

    it('迁移为纯 localStorage 层：不依赖任何 store 即可独立调用', () => {
      // 防回归：本文件未 import pinia，migrate 在 store 创建前也可安全执行
      localStorage.setItem('aidea-shortcuts', JSON.stringify({ 'demo:act': 'j' }))
      expect(() => migrateShortcutOverrides()).not.toThrow()
      expect(JSON.parse(localStorage.getItem('aidea-plugin-config.demo')!).shortcuts).toEqual({ act: 'j' })
    })
  })
})
