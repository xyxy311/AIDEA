import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useAIDirectionsStore } from '../stores/aiDirections'
import { usePluginConfigStore } from '@/stores/pluginConfig'
import { DEFAULT_AI_DIRECTIONS, AI_DIRECTION_ANY, AI_DIRECTION_FOCUS, AI_PLUGIN_ID } from '../constants'
import type { AIDivergenceDirection } from '../types'

/** 内存版 localStorage mock（供 pluginConfig / 迁移源键使用） */
function createLocalStorageMock(): Storage {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    clear: vi.fn(() => {
      store = {}
    }),
    getItem: vi.fn((key: string) => (key in store ? store[key] : null)),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = String(value)
    }),
  }
}

/** 插件配置文件 key（aiDirections 持久化于其 data 段） */
const PLUGIN_FILE_KEY = `aidea-plugin-config.${AI_PLUGIN_ID}`
/** data 段键：方向列表 / 默认方向 id */
const DIRECTIONS_KEY = 'directions'
const DEFAULT_DIRECTION_KEY = 'defaultDirectionId'
/** 旧版主程序 localStorage 键（迁移源） */
const LEGACY_STORAGE_KEY = 'bb-ai-directions'
const LEGACY_DEFAULT_DIRECTION_KEY = 'bb-ai-default-direction'

/** 读取插件配置文件 data 段中持久化的方向 JSON（未存/无文件返回 null；须在 nextTick 后调用） */
function readStored(): AIDivergenceDirection[] | null {
  const raw = localStorage.getItem(PLUGIN_FILE_KEY)
  if (raw == null) return null
  const file = JSON.parse(raw) as { data?: Record<string, unknown> }
  const stored = file.data?.[DIRECTIONS_KEY]
  return Array.isArray(stored) ? (stored as AIDivergenceDirection[]) : null
}

describe('useAIDirectionsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', createLocalStorageMock())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('空配置时初始化出默认方向（数量 ≥ 4，含「为什么？」；任意/聚焦固定 id）', () => {
    const store = useAIDirectionsStore()
    expect(store.directionList.length).toBeGreaterThanOrEqual(DEFAULT_AI_DIRECTIONS.length)
    expect(store.directionList.length).toBeGreaterThanOrEqual(4)
    expect(store.directionList.some((d) => d.title === '为什么？')).toBe(true)
    // 任意/聚焦使用固定 id（'direction-any' / 'direction-focus'），其余预设为 nanoid 生成
    const any = store.directionList.find((d) => d.id === 'direction-any')
    const focus = store.directionList.find((d) => d.id === 'direction-focus')
    expect(any).toEqual(AI_DIRECTION_ANY)
    expect(focus).toEqual(AI_DIRECTION_FOCUS)
    // 每项都带 id 且 title/prompt 非空
    for (const d of store.directionList) {
      expect(d.id).toBeTruthy()
      expect(d.title).toBeTruthy()
      expect(d.prompt).toBeTruthy()
    }
  })

  it('addDirection 追加并返回带 id 项（默认 separator 为空格，可传入自定义分隔符）', () => {
    const store = useAIDirectionsStore()
    const before = store.directionList.length
    const item = store.addDirection('新方向', '新提示词')
    expect(item.id).toBeTruthy()
    expect(item.title).toBe('新方向')
    expect(item.prompt).toBe('新提示词')
    expect(item.separator).toBe(' ')
    expect(store.directionList.length).toBe(before + 1)
    expect(store.directionList[store.directionList.length - 1]).toEqual(item)

    const custom = store.addDirection('分隔符方向', '提示', '，')
    expect(custom.separator).toBe('，')
  })

  it('updateDirection 改 title/prompt', () => {
    const store = useAIDirectionsStore()
    const item = store.addDirection('原题', '原提示')
    store.updateDirection(item.id, { title: '新题', prompt: '新提示' })
    expect(store.directionList.find((d) => d.id === item.id)).toEqual({
      id: item.id,
      title: '新题',
      prompt: '新提示',
      separator: ' ',
    })
    // 只改一个字段
    store.updateDirection(item.id, { title: '再换题' })
    expect(store.directionList.find((d) => d.id === item.id)).toEqual({
      id: item.id,
      title: '再换题',
      prompt: '新提示',
      separator: ' ',
    })
    // 不存在的 id 忽略
    store.updateDirection('no-such-id', { title: 'x' })
    expect(store.directionList.find((d) => d.id === item.id)?.title).toBe('再换题')
  })

  it('deleteDirection 移除', () => {
    const store = useAIDirectionsStore()
    const item = store.addDirection('要删的', '提示')
    const before = store.directionList.length
    store.deleteDirection(item.id)
    expect(store.directionList.length).toBe(before - 1)
    expect(store.directionList.some((d) => d.id === item.id)).toBe(false)
  })

  it('reorderDirection 交换顺序，越界时不变', () => {
    const store = useAIDirectionsStore()
    // 清空后手动构造确定顺序
    store.directions = [
      { id: 'a', title: 'A', prompt: 'pa' },
      { id: 'b', title: 'B', prompt: 'pb' },
      { id: 'c', title: 'C', prompt: 'pc' },
    ]
    store.reorderDirection(0, 2)
    expect(store.directionList.map((d) => d.id)).toEqual(['b', 'c', 'a'])

    // 越界（fromIndex 越界）不变
    store.reorderDirection(5, 0)
    expect(store.directionList.map((d) => d.id)).toEqual(['b', 'c', 'a'])

    // 越界（toIndex 越界）不变
    store.reorderDirection(0, 9)
    expect(store.directionList.map((d) => d.id)).toEqual(['b', 'c', 'a'])

    // 负数越界不变
    store.reorderDirection(-1, 1)
    expect(store.directionList.map((d) => d.id)).toEqual(['b', 'c', 'a'])

    // fromIndex === toIndex 不变
    store.reorderDirection(1, 1)
    expect(store.directionList.map((d) => d.id)).toEqual(['b', 'c', 'a'])
  })

  it('坏插件配置文件存储能自愈回退默认', async () => {
    localStorage.setItem(PLUGIN_FILE_KEY, 'not-valid-json{{{')
    const store = useAIDirectionsStore()
    expect(store.directionList.length).toBeGreaterThanOrEqual(DEFAULT_AI_DIRECTIONS.length)
    // 坏文件被删除并回退为合法默认数据（pluginConfig 落盘为异步 flush，等微任务后断言）
    await nextTick()
    const stored = readStored()
    expect(stored).not.toBeNull()
    expect(stored!.length).toBeGreaterThanOrEqual(DEFAULT_AI_DIRECTIONS.length)
    expect(store.directionList.some((d) => d.title === '为什么？')).toBe(true)
  })

  it('结构不符（缺字段 / 重复 id）自愈回退默认', () => {
    const pluginConfig = usePluginConfigStore()
    // 缺字段
    pluginConfig.setData(AI_PLUGIN_ID, DIRECTIONS_KEY, [{ id: 'x', title: '只有题' }])
    let store = useAIDirectionsStore()
    expect(store.directionList.length).toBeGreaterThanOrEqual(4)

    // 重复 id（重开 store 前先重置持久化数据）
    pluginConfig.setData(AI_PLUGIN_ID, DIRECTIONS_KEY, [
      { id: 'dup', title: 'T1', prompt: 'P1' },
      { id: 'dup', title: 'T2', prompt: 'P2' },
    ])
    store = useAIDirectionsStore()
    expect(store.directionList.length).toBeGreaterThanOrEqual(4)
  })

  it('getDefaultDirection：默认指向「任意发散」（固定 id），返回其方向对象', () => {
    const store = useAIDirectionsStore()
    expect(store.defaultDirectionId).toBe('direction-any')
    expect(store.getDefaultDirection()).toEqual(AI_DIRECTION_ANY)
  })

  it('setDefaultDirection：有效 id 写入，无效/不存在 id 被忽略', () => {
    const store = useAIDirectionsStore()
    // 用新增方向作为目标默认
    const item = store.addDirection('我的方向', '提示', '，')
    store.setDefaultDirection(item.id)
    expect(store.defaultDirectionId).toBe(item.id)
    expect(store.getDefaultDirection()).toEqual(item)

    // 无效 id 忽略，默认保持不变
    store.setDefaultDirection('no-such-id')
    expect(store.defaultDirectionId).toBe(item.id)
    expect(store.getDefaultDirection()).toEqual(item)
  })

  it('getDefaultDirection：默认方向指向的方向被删除后回退「任意发散」', () => {
    const store = useAIDirectionsStore()
    // 指向任意发散后删除它，getDefaultDirection 应回退任意发散
    store.setDefaultDirection('direction-any')
    store.deleteDirection('direction-any')
    expect(store.directionList.some((d) => d.id === 'direction-any')).toBe(false)
    expect(store.getDefaultDirection()).toEqual(AI_DIRECTION_ANY)
  })

  it('resetToDefaults：方向重建为默认集、默认方向重置为任意发散，并写回插件配置文件', async () => {
    const store = useAIDirectionsStore()
    store.directions = [store.addDirection('自定义', '提示', ' ')]
    store.setDefaultDirection(store.directionList[0].id)
    expect(store.directionList.length).toBe(1)

    store.resetToDefaults()

    // 方向重建为默认初始集（任意/聚焦固定 id + 其余 nanoid）
    expect(store.directionList.length).toBeGreaterThanOrEqual(DEFAULT_AI_DIRECTIONS.length)
    const any = store.directionList.find((d) => d.id === 'direction-any')
    const focus = store.directionList.find((d) => d.id === 'direction-focus')
    expect(any).toEqual(AI_DIRECTION_ANY)
    expect(focus).toEqual(AI_DIRECTION_FOCUS)
    expect(store.directionList.some((d) => d.title === '为什么？')).toBe(true)
    // 默认方向重置为任意发散
    expect(store.defaultDirectionId).toBe('direction-any')
    expect(store.getDefaultDirection()).toEqual(AI_DIRECTION_ANY)
    // 同步写回插件配置文件（落盘为异步 flush，等微任务后断言）
    await nextTick()
    expect(readStored()).not.toBeNull()
    const file = JSON.parse(localStorage.getItem(PLUGIN_FILE_KEY)!) as {
      data: Record<string, unknown>
    }
    expect(file.data[DEFAULT_DIRECTION_KEY]).toBe('direction-any')
  })

  it('一次性迁移：旧 localStorage 键（bb-ai-*）→ 插件 config，随后删除旧键', () => {
    const legacy: AIDivergenceDirection[] = [
      { id: 'legacy-1', title: '旧方向', prompt: '旧提示词' },
    ]
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy))
    localStorage.setItem(LEGACY_DEFAULT_DIRECTION_KEY, 'legacy-1')

    const store = useAIDirectionsStore()

    // 方向与默认方向来自旧键
    expect(store.directionList).toEqual(legacy)
    expect(store.defaultDirectionId).toBe('legacy-1')
    // 插件 config 已写入（config.set 同步可见）
    const pluginConfig = usePluginConfigStore()
    expect(pluginConfig.getData(AI_PLUGIN_ID, DIRECTIONS_KEY)).toEqual(legacy)
    expect(pluginConfig.getData(AI_PLUGIN_ID, DEFAULT_DIRECTION_KEY)).toBe('legacy-1')
    // 旧键已删除
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(LEGACY_DEFAULT_DIRECTION_KEY)).toBeNull()
  })

  it('一次性迁移：坏 JSON 旧键直接丢弃走默认初始化，旧键仍被清理', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, 'not-valid-json{{{')
    localStorage.setItem(LEGACY_DEFAULT_DIRECTION_KEY, 'direction-any')

    const store = useAIDirectionsStore()

    // 坏旧数据不进 config，走默认初始化
    expect(store.directionList.some((d) => d.title === '为什么？')).toBe(true)
    expect(store.defaultDirectionId).toBe('direction-any')
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(LEGACY_DEFAULT_DIRECTION_KEY)).toBeNull()
  })

  it('一次性迁移：插件 config 已有数据时保留 config 数据，仅清理旧键', () => {
    const pluginConfig = usePluginConfigStore()
    const configured: AIDivergenceDirection[] = [{ id: 'cfg-1', title: '配置方向', prompt: '配置提示词' }]
    pluginConfig.setData(AI_PLUGIN_ID, DIRECTIONS_KEY, configured)
    pluginConfig.setData(AI_PLUGIN_ID, DEFAULT_DIRECTION_KEY, 'cfg-1')

    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify([{ id: 'legacy', title: '旧', prompt: '旧' }]))
    localStorage.setItem(LEGACY_DEFAULT_DIRECTION_KEY, 'legacy')

    const store = useAIDirectionsStore()

    // 尊重插件已有数据，不覆盖
    expect(store.directionList).toEqual(configured)
    expect(store.defaultDirectionId).toBe('cfg-1')
    // 旧键仍被清理
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(LEGACY_DEFAULT_DIRECTION_KEY)).toBeNull()
  })
})
