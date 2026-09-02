import { describe, it, expect } from 'vitest'
import type { TopBarId } from '@/constants/topbar'
import { DEFAULT_LEFT_TOP, DEFAULT_RIGHT_TOP } from '@/constants/topbar'
import {
  defaultTopBarState,
  normalizeTopBarState,
  reorderTopCore,
  moveTopZoneCore,
} from '@/utils/topbar'

const REGISTRY: TopBarId[] = [
  'open', 'save', 'undo', 'redo', 'settings',
  'debug', 'ai-mode', 'grid', 'add-node',
]

const DEFAULTS = { left: DEFAULT_LEFT_TOP, right: DEFAULT_RIGHT_TOP }

function baseState() {
  return defaultTopBarState(DEFAULT_LEFT_TOP, DEFAULT_RIGHT_TOP)
}

describe('topbar 纯函数', () => {
  describe('默认布局', () => {
    it('DEFAULT_LEFT_TOP / DEFAULT_RIGHT_TOP 按 defaultZone 派生', () => {
      expect(DEFAULT_LEFT_TOP).toEqual(['open', 'save', 'undo', 'redo', 'settings'])
      expect(DEFAULT_RIGHT_TOP).toEqual(['debug', 'ai-mode', 'grid', 'add-node'])
    })

    it('defaultTopBarState：左右各一份默认顺序', () => {
      const s = defaultTopBarState(DEFAULT_LEFT_TOP, DEFAULT_RIGHT_TOP)
      expect(s.leftTop).toEqual(DEFAULT_LEFT_TOP)
      expect(s.rightTop).toEqual(DEFAULT_RIGHT_TOP)
    })
  })

  describe('normalizeTopBarState', () => {
    it('过滤无效 id 与重复 id', () => {
      const s = normalizeTopBarState(
        {
          leftTop: ['open', 'save', 'save', 'nope' as TopBarId],
          rightTop: ['grid', 'grid', 'bad' as TopBarId],
        },
        REGISTRY,
      )
      expect(s.leftTop).toEqual(['open', 'save'])
      expect(s.rightTop).toEqual(['grid'])
    })

    it('补充新增的默认按钮（旧 localStorage 不含新按钮时自动补入）', () => {
      const s = normalizeTopBarState(
        {
          leftTop: ['open', 'save', 'undo', 'redo'],
          rightTop: ['debug', 'ai-mode', 'grid'],
        },
        REGISTRY,
        DEFAULTS,
      )
      // settings 左侧缺失补全；add-node 右侧缺失补全
      expect(s.leftTop).toEqual(['open', 'save', 'undo', 'redo', 'settings'])
      expect(s.rightTop).toEqual(['debug', 'ai-mode', 'grid', 'add-node'])
    })

    it('已放置的按钮不会被重复补充', () => {
      const s = normalizeTopBarState(
        { leftTop: ['open'], rightTop: ['grid'] },
        REGISTRY,
        DEFAULTS,
      )
      expect(s.leftTop.filter((id) => id === 'open')).toHaveLength(1)
      expect(s.rightTop.filter((id) => id === 'grid')).toHaveLength(1)
    })
  })

  describe('normalizeTopBarState isExtraValid（插件按钮 key 合法性）', () => {
    const known = new Set<string>(['demo:btn', 'demo:export'])
    const isExtraValid = (id: string): boolean => known.has(id)

    it('插件 key 在 isExtraValid 命中时保留', () => {
      const s = normalizeTopBarState(
        { leftTop: ['open', 'demo:btn' as TopBarId], rightTop: ['grid', 'demo:export' as TopBarId] },
        REGISTRY,
        undefined,
        { isExtraValid },
      )
      expect(s.leftTop).toContain('demo:btn')
      expect(s.rightTop).toContain('demo:export')
    })

    it('插件 key 未命中 isExtraValid 时剔除', () => {
      const s = normalizeTopBarState(
        { leftTop: ['open', 'ghost:x' as TopBarId], rightTop: ['ghost:y' as TopBarId] },
        REGISTRY,
        undefined,
        { isExtraValid },
      )
      expect(s.leftTop).not.toContain('ghost:x')
      expect(s.rightTop).not.toContain('ghost:y')
    })

    it('内置默认按钮补充行为不变（回归）', () => {
      const s = normalizeTopBarState(
        { leftTop: ['open', 'save', 'undo', 'redo', 'demo:btn' as TopBarId], rightTop: ['debug', 'ai-mode', 'grid'] },
        REGISTRY,
        DEFAULTS,
        { isExtraValid },
      )
      // settings 左侧缺失补全；add-node 右侧缺失补全；插件 key 保留
      expect(s.leftTop).toEqual(['open', 'save', 'undo', 'redo', 'demo:btn', 'settings'])
      expect(s.rightTop).toEqual(['debug', 'ai-mode', 'grid', 'add-node'])
    })
  })

  describe('reorderTopCore', () => {
    it('同一侧内换位', () => {
      const s: ReturnType<typeof baseState> = defaultTopBarState(
        ['open', 'save', 'undo'],
        [],
      )
      const next = reorderTopCore(s, 'left', 0, 2)
      expect(next.leftTop).toEqual(['save' as TopBarId, 'undo' as TopBarId, 'open' as TopBarId])
    })

    it('from === to 返回原对象', () => {
      const s = baseState()
      expect(reorderTopCore(s, 'left', 1, 1)).toBe(s)
    })
  })

  describe('moveTopZoneCore', () => {
    it('跨区移动：从 left 移除并加到 right 末尾', () => {
      const s = baseState()
      const next = moveTopZoneCore(s, 'open', 'right')
      expect(next.leftTop).toEqual(['save', 'undo', 'redo', 'settings'])
      expect(next.rightTop).toEqual(['debug', 'ai-mode', 'grid', 'add-node', 'open'])
    })

    it('已在目标侧则不重复添加', () => {
      const s = baseState()
      const next = moveTopZoneCore(s, 'grid', 'right')
      expect(next.rightTop.filter((id) => id === 'grid')).toHaveLength(1)
      expect(next.leftTop).toEqual(DEFAULT_LEFT_TOP)
    })
  })
})