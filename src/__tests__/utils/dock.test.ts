import { describe, it, expect } from 'vitest'
import type { PanelId } from '@/constants/panels'
import { DEFAULT_LEFT_PANELS, DEFAULT_RIGHT_PANELS } from '@/constants/panels'
import {
  defaultRightSizes,
  defaultDockState,
  normalizeDockState,
  moveToLeftCore,
  moveToRightCore,
  reorderRightCore,
  removePanelCore,
  setRightSizeCore,
  DEFAULT_SIZE,
  type DockState,
} from '@/utils/dock'

const REGISTRY: PanelId[] = ['nodeTree', 'references', 'search', 'presets', 'tags', 'property', 'ai']

function baseState(): DockState {
  return defaultDockState(DEFAULT_LEFT_PANELS, DEFAULT_RIGHT_PANELS)
}

describe('dock 纯函数', () => {
  describe('默认布局', () => {
    it('DEFAULT_LEFT_PANELS 排除右侧默认面板（property / presets）', () => {
      expect(DEFAULT_LEFT_PANELS).toEqual(['nodeTree', 'references', 'search', 'tags', 'ai'])
    })

    it('defaultDockState：左侧默认面板-右侧默认[property,presets]，尺寸默认 1', () => {
      const s = defaultDockState(DEFAULT_LEFT_PANELS, DEFAULT_RIGHT_PANELS)
      expect(s.leftPanels).toEqual(DEFAULT_LEFT_PANELS)
      expect(s.rightPanels).toEqual(DEFAULT_RIGHT_PANELS)
      expect(s.rightSizes).toEqual({ property: DEFAULT_SIZE, presets: DEFAULT_SIZE })
    })
  })

  describe('normalizeDockState', () => {
    it('过滤无效 id 与重复 id', () => {
      const raw: DockState = {
        leftPanels: ['nodeTree', 'search', 'search', 'nope' as PanelId],
        rightPanels: ['property', 'property', 'bad' as PanelId],
        rightSizes: {},
      }
      const s = normalizeDockState(raw, REGISTRY)
      expect(s.leftPanels).toEqual(['nodeTree', 'search'])
      expect(s.rightPanels).toEqual(['property'])
      expect(s.rightSizes).toEqual({ property: DEFAULT_SIZE })
    })

    it('同一面板出现在两侧时优先保留在右侧', () => {
      const raw: DockState = {
        leftPanels: ['nodeTree', 'property'],
        rightPanels: ['property'],
        rightSizes: { property: 3 },
      }
      const s = normalizeDockState(raw, REGISTRY)
      expect(s.leftPanels).toEqual(['nodeTree'])
      expect(s.rightPanels).toEqual(['property'])
      expect(s.rightSizes).toEqual({ property: 3 })
    })

    it('非法尺寸回退默认，合法尺寸保留', () => {
      const raw: DockState = {
        leftPanels: ['nodeTree'],
        rightPanels: ['property'],
        rightSizes: { property: -5 },
      }
      const s = normalizeDockState(raw, REGISTRY)
      expect(s.rightSizes.property).toBe(DEFAULT_SIZE)
    })

    it('补充新增的默认面板（旧 localStorage 不含新面板时自动补入）', () => {
      const raw: DockState = {
        leftPanels: ['nodeTree', 'references', 'search', 'tags'],
        rightPanels: ['property', 'presets'],
        rightSizes: { property: 1, presets: 1 },
      }
      const s = normalizeDockState(
        raw,
        REGISTRY,
        { left: DEFAULT_LEFT_PANELS, right: DEFAULT_RIGHT_PANELS },
      )
      // 旧 saved 布局不含 ai，应补到左侧末尾
      expect(s.leftPanels).toEqual(['nodeTree', 'references', 'search', 'tags', 'ai'])
      expect(s.rightPanels).toEqual(['property', 'presets'])
    })

    it('已放置的面板不会被重复补充', () => {
      const raw: DockState = {
        leftPanels: ['nodeTree'],
        rightPanels: ['property'],
        rightSizes: { property: 1 },
      }
      const s = normalizeDockState(
        raw,
        REGISTRY,
        { left: DEFAULT_LEFT_PANELS, right: DEFAULT_RIGHT_PANELS },
      )
      // ai 只出现一次（左侧）
      expect(s.leftPanels.filter((id) => id === 'ai')).toHaveLength(1)
    })
  })

  describe('右侧内换位 reorderRightCore', () => {
    it('把 from 移到 to', () => {
      const s: DockState = {
        leftPanels: [],
        rightPanels: ['a' as PanelId, 'b' as PanelId, 'c' as PanelId],
        rightSizes: {},
      }
      const next = reorderRightCore(s, 0, 2)
      expect(next.rightPanels).toEqual(['b' as PanelId, 'c' as PanelId, 'a' as PanelId])
    })

    it('from === to 返回原对象', () => {
      const s: DockState = {
        leftPanels: [],
        rightPanels: ['a' as PanelId, 'b' as PanelId],
        rightSizes: {},
      }
      expect(reorderRightCore(s, 1, 1)).toBe(s)
    })
  })

  describe('moveToLeftCore', () => {
    it('从右侧移除并加入左侧末尾', () => {
      const s: DockState = {
        leftPanels: ['nodeTree'],
        rightPanels: ['property', 'search'],
        rightSizes: { property: 2, search: 1 },
      }
      const next = moveToLeftCore(s, 'search')
      expect(next.leftPanels).toEqual(['nodeTree', 'search'])
      expect(next.rightPanels).toEqual(['property'])
      expect(next.rightSizes).toEqual({ property: 2 })
    })

    it('已在左侧则不重复添加', () => {
      const s: DockState = {
        leftPanels: ['nodeTree'],
        rightPanels: ['property'],
        rightSizes: { property: 1 },
      }
      const next = moveToLeftCore(s, 'nodeTree')
      expect(next.leftPanels).toEqual(['nodeTree'])
      expect(next.rightPanels).toEqual(['property'])
    })
  })

  describe('moveToRightCore', () => {
    it('从左侧移除并加入右侧指定位置', () => {
      const s: DockState = {
        leftPanels: ['nodeTree', 'search'],
        rightPanels: ['property'],
        rightSizes: { property: 1 },
      }
      const next = moveToRightCore(s, 'search', 0)
      expect(next.leftPanels).toEqual(['nodeTree'])
      expect(next.rightPanels).toEqual(['search', 'property'])
      expect(next.rightSizes.search).toBe(DEFAULT_SIZE)
    })

    it('已在右侧则视为 reorder', () => {
      const s: DockState = {
        leftPanels: ['nodeTree'],
        rightPanels: ['property', 'search'],
        rightSizes: { property: 1, search: 1 },
      }
      const next = moveToRightCore(s, 'search', 0)
      expect(next.leftPanels).toEqual(['nodeTree'])
      expect(next.rightPanels).toEqual(['search', 'property'])
    })

    it('越界 toIndex 追加到末尾', () => {
      const s: DockState = {
        leftPanels: ['nodeTree'],
        rightPanels: ['property'],
        rightSizes: { property: 1 },
      }
      const next = moveToRightCore(s, 'nodeTree', 99)
      expect(next.rightPanels).toEqual(['property', 'nodeTree'])
    })
  })

  describe('removePanelCore', () => {
    it('从两侧移除并清理尺寸', () => {
      const s: DockState = {
        leftPanels: ['nodeTree', 'search'],
        rightPanels: ['property'],
        rightSizes: { property: 2 },
      }
      const next = removePanelCore(s, 'property')
      expect(next.leftPanels).toEqual(['nodeTree', 'search'])
      expect(next.rightPanels).toEqual([])
      expect(next.rightSizes).toEqual({})
    })
  })

  describe('setRightSizeCore', () => {
    it('设置高度比例，下限 0.1', () => {
      const s = baseState()
      const next = setRightSizeCore(s, 'property', 4)
      expect(next.rightSizes.property).toBe(4)
      const low = setRightSizeCore(s, 'property', 0)
      expect(low.rightSizes.property).toBe(0.1)
    })
  })
})