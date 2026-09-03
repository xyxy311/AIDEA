import { describe, it, expect } from 'vitest'
import { parseTopDelta, deriveTopLayout, type ZoneDef } from '@/utils/topbar'

/** 测试登记表（含一个插件 key） */
const DEFS: ZoneDef[] = [
  { key: 'open', defaultZone: 'left' },
  { key: 'save', defaultZone: 'left' },
  { key: 'undo', defaultZone: 'left' },
  { key: 'debug', defaultZone: 'right' },
  { key: 'grid', defaultZone: 'right' },
  { key: 'demo:btn', defaultZone: 'left' },
]

const ALL_KEYS = DEFS.map((d) => d.key)
const isKnown = (k: string): boolean => ALL_KEYS.includes(k)

describe('parseTopDelta', () => {
  it('非对象 → 空 delta；字段形状不符丢弃', () => {
    expect(parseTopDelta(undefined, isKnown)).toEqual({})
    expect(parseTopDelta({ leftOrder: 'x' }, isKnown)).toEqual({})
  })

  it('过滤未知键 / 重复 / 非字符串', () => {
    const delta = parseTopDelta({ leftOrder: ['open', 'nope', 'open', 7], rightOrder: ['debug'] }, isKnown)
    expect(delta.leftOrder).toEqual(['open'])
    expect(delta.rightOrder).toEqual(['debug'])
  })
})

describe('deriveTopLayout', () => {
  it('无 delta → 按 defaultZone 与登记顺序派生', () => {
    const p = deriveTopLayout(DEFS, {})
    expect(p.left).toEqual(['open', 'save', 'undo', 'demo:btn'])
    expect(p.right).toEqual(['debug', 'grid'])
  })

  it('跨侧覆盖：默认右侧按钮写入 leftOrder 后归属左', () => {
    const p = deriveTopLayout(DEFS, { leftOrder: ['debug', 'open'], rightOrder: ['grid'] })
    expect(p.left).toEqual(['debug', 'open', 'save', 'undo', 'demo:btn'])
    expect(p.right).toEqual(['grid'])
  })

  it('同现两侧时右优先', () => {
    const p = deriveTopLayout(DEFS, { leftOrder: ['grid'], rightOrder: ['grid'] })
    expect(p.left).toEqual(['open', 'save', 'undo', 'demo:btn'])
    expect(p.right).toEqual(['grid', 'debug'])
  })

  it('新登记插件按钮自动追加默认侧末尾', () => {
    const p = deriveTopLayout(DEFS, { leftOrder: ['save', 'open'] })
    expect(p.left).toEqual(['save', 'open', 'undo', 'demo:btn'])
  })
})
