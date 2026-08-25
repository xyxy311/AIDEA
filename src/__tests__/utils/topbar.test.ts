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