import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAIDirectionsStore } from '@/stores/aiDirections'
import { DEFAULT_AI_DIRECTIONS, AI_DIRECTION_ANY, AI_DIRECTION_FOCUS } from '@/constants/ai'
import type { AIDivergenceDirection } from '@/types/ai'

/** 内存版 localStorage mock（供 useStorage 使用） */
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

/** 读取当前 localStorage 中持久化的方向 JSON（未存则返回 null） */
function readStored(): AIDivergenceDirection[] | null {
  const raw = localStorage.getItem('bb-ai-directions')
  if (raw == null) return null
  return JSON.parse(raw) as AIDivergenceDirection[]
}

describe('useAIDirectionsStore', () => {
  const STORAGE_KEY = 'bb-ai-directions'

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', createLocalStorageMock())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('空 localStorage 时初始化出默认方向（数量 ≥ 4，含「为什么？」；任意/聚焦固定 id）', () => {
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

  it('坏 JSON 存储能自愈回退默认', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{')
    const store = useAIDirectionsStore()
    expect(store.directionList.length).toBeGreaterThanOrEqual(DEFAULT_AI_DIRECTIONS.length)
    // 坏文件被删除并回退为合法默认数据
    const stored = readStored()
    expect(stored).not.toBeNull()
    expect(stored!.length).toBeGreaterThanOrEqual(DEFAULT_AI_DIRECTIONS.length)
    expect(store.directionList.some((d) => d.title === '为什么？')).toBe(true)
  })

  it('结构不符（缺字段 / 空值 / 重复 id）自愈回退默认', () => {
    // 缺字段
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: 'x', title: '只有题' }]))
    let store = useAIDirectionsStore()
    expect(store.directionList.length).toBeGreaterThanOrEqual(4)

    // 空 title
    store = useAIDirectionsStore()
    expect(store.directionList.length).toBeGreaterThanOrEqual(4)

    // 重复 id
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'dup', title: 'T1', prompt: 'P1' },
        { id: 'dup', title: 'T2', prompt: 'P2' },
      ]),
    )
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

  it('resetToDefaults：删除两存储键，方向重建为默认集、默认方向重置为任意发散', () => {
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
    // 同步落盘
    expect(localStorage.getItem('bb-ai-directions')).not.toBeNull()
    expect(localStorage.getItem('bb-ai-default-direction')).toBe('direction-any')
  })
})