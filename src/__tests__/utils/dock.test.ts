import { describe, it, expect } from 'vitest'
import {
  parseDockDelta,
  deriveDockLayout,
  reorderSeq,
  dropSize,
  type PlacementDef,
  type DockPlacement,
  type DockDelta,
} from '@/utils/dock'

/** 测试登记表（含一个插件 key，覆盖模板字面量键形态） */
const DEFS: PlacementDef[] = [
  { key: 'a', defaultPlacement: 'left' },
  { key: 'b', defaultPlacement: 'left' },
  { key: 'c', defaultPlacement: 'right' },
  { key: 'd', defaultPlacement: 'right' },
  { key: 'demo:p', defaultPlacement: 'right' },
]

const ALL_KEYS = DEFS.map((d) => d.key)
const isKnown = (k: string): boolean => ALL_KEYS.includes(k)

/** 派生结果按 string[] 比较（键在运行时即普通字符串） */
const str = (p: DockPlacement): { left: string[]; right: string[] } => ({
  left: p.left as string[],
  right: p.right as string[],
})

/** 测试用 delta 构造（键为任意字符串，绕开 PanelKey 字面量类型检查） */
const delta = (d: {
  leftOrder?: string[]
  rightOrder?: string[]
  removed?: string[]
  rightSizes?: Record<string, number>
}): DockDelta => d as unknown as DockDelta

describe('parseDockDelta', () => {
  it('非对象 / undefined → 空 delta', () => {
    expect(parseDockDelta(undefined, isKnown)).toEqual({})
    expect(parseDockDelta('x', isKnown)).toEqual({})
    expect(parseDockDelta(null, isKnown)).toEqual({})
  })

  it('过滤未知键与重复项；保留合法顺序', () => {
    const delta = parseDockDelta(
      { leftOrder: ['a', 'zzz', 'b', 'a', 42, null], rightOrder: ['c', 'c', 'd'] },
      isKnown,
    )
    expect(delta.leftOrder).toEqual(['a', 'b'])
    expect(delta.rightOrder).toEqual(['c', 'd'])
  })

  it('removed 字段同样过滤；rightSizes 仅保留已知键的正数', () => {
    const delta = parseDockDelta(
      { removed: ['b', 'nope'], rightSizes: { c: 2.5, a: -1, d: 'x', nope: 3 } },
      isKnown,
    )
    expect(delta.removed).toEqual(['b'])
    expect(delta.rightSizes).toEqual({ c: 2.5 })
  })

  it('空数组字段保留为空覆盖；空尺寸丢弃', () => {
    const delta = parseDockDelta({ leftOrder: [], rightSizes: {} }, isKnown)
    expect(delta.leftOrder).toEqual([])
    expect(delta.rightSizes).toBeUndefined()
  })
})

describe('deriveDockLayout', () => {
  it('无 delta → 按登记 defaultPlacement 与登记顺序派生', () => {
    const p = str(deriveDockLayout(DEFS, {}))
    expect(p.left).toEqual(['a', 'b'])
    expect(p.right).toEqual(['c', 'd', 'demo:p'])
  })

  it('removed 面板被排除（未放置）', () => {
    const p = str(deriveDockLayout(DEFS, delta({ removed: ['b', 'c'] })))
    expect(p.left).toEqual(['a'])
    expect(p.right).toEqual(['d', 'demo:p'])
  })

  it('leftOrder 覆盖默认归属与顺序（默认右侧的面板移入左侧）', () => {
    const p = str(deriveDockLayout(DEFS, delta({ leftOrder: ['c', 'a', 'b'] })))
    expect(p.left).toEqual(['c', 'a', 'b'])
    expect(p.right).toEqual(['d', 'demo:p'])
  })

  it('同现两侧时右优先（与旧归一化语义一致）', () => {
    const p = str(deriveDockLayout(DEFS, delta({ leftOrder: ['c'], rightOrder: ['c', 'd'] })))
    expect(p.left).toEqual(['a', 'b'])
    expect(p.right).toEqual(['c', 'd', 'demo:p'])
  })

  it('有序并集：用户顺序优先，未覆盖项按登记顺序追加', () => {
    const p = str(
      deriveDockLayout(DEFS, delta({ leftOrder: ['b', 'a'], rightOrder: ['demo:p'] })),
    )
    expect(p.left).toEqual(['b', 'a'])
    expect(p.right).toEqual(['demo:p', 'c', 'd'])
  })

  it('跨侧移动后语义：leftOrder 覆盖默认归属，归属稳定', () => {
    const p = str(
      deriveDockLayout(
        DEFS,
        delta({
          leftOrder: ['a', 'b', 'demo:p'],
          rightOrder: ['c', 'd'],
        }),
      ),
    )
    expect(p.left).toEqual(['a', 'b', 'demo:p'])
    expect(p.right).toEqual(['c', 'd'])
  })
})

describe('reorderSeq / dropSize', () => {
  it('reorderSeq：把 from 位移动到 to 位', () => {
    expect(reorderSeq(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(reorderSeq(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('reorderSeq：from === to 原样；to 越界钳制；from 越界原样返回', () => {
    const seq = ['a', 'b']
    expect(reorderSeq(seq, 1, 1)).toBe(seq)
    expect(reorderSeq(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a'])
    expect(reorderSeq(['a', 'b', 'c'], -5, 1)).toEqual(['a', 'b', 'c'])
  })

  it('dropSize：删除目标键；不存在时返回等价副本', () => {
    expect(dropSize({ a: 1, b: 2 }, 'a')).toEqual({ b: 2 })
    const sizes = { a: 1 }
    expect(dropSize(sizes, 'x')).toEqual({ a: 1 })
    expect(dropSize(sizes, 'x')).not.toBe(sizes)
  })
})
