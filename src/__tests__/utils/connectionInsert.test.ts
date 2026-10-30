import { describe, it, expect } from 'vitest'
import {
  segmentIntersectsRect,
  findConnectionInsertTarget,
} from '@/utils/connectionInsert'
import type { Connection } from '@/types'

const RECT = { x: 100, y: 100, width: 80, height: 60 }
const PAD = 8

function makeConn(id: string, from: string, to: string): Connection {
  return {
    id,
    fromNodeId: from,
    toNodeId: to,
    lineStyle: 'solid',
    strokeWidth: 2,
    strokeColor: '#000000',
    directed: true,
    text: null,
  }
}

describe('segmentIntersectsRect', () => {
  it('穿过矩形判定相交', () => {
    expect(segmentIntersectsRect(0, 130, 300, 130, RECT, PAD)).toBe(true)
  })

  it('与矩形相交但不进内部（擦边穿过外扩区）也判定相交', () => {
    // y=95 在矩形上方 5px，外扩 8px 后被扫过
    expect(segmentIntersectsRect(0, 95, 300, 95, RECT, PAD)).toBe(true)
    // y=85 超出外扩范围
    expect(segmentIntersectsRect(0, 85, 300, 85, RECT, PAD)).toBe(false)
  })

  it('不经过矩形的线段不相交', () => {
    expect(segmentIntersectsRect(0, 0, 300, 0, RECT, PAD)).toBe(false)
  })

  it('线段端点在矩形内判定相交', () => {
    expect(segmentIntersectsRect(120, 120, 500, 500, RECT, PAD)).toBe(true)
  })

  it('零长度线段按点包含判定', () => {
    expect(segmentIntersectsRect(140, 130, 140, 130, RECT, PAD)).toBe(true)
    expect(segmentIntersectsRect(0, 0, 0, 0, RECT, PAD)).toBe(false)
  })

  it('线段止于外扩边界外不相交（只擦到角落延长线）', () => {
    // 线段在矩形左侧外，横向不进入 [92, 188]
    expect(segmentIntersectsRect(0, 130, 90, 130, RECT, PAD)).toBe(false)
  })
})

describe('findConnectionInsertTarget', () => {
  const nodes = new Map([
    ['a', { x: 0, y: 0, width: 80, height: 60 }],
    ['b', { x: 400, y: 0, width: 80, height: 60 }],
  ])
  const getNode = (id: string) => nodes.get(id)
  const conns = [makeConn('c1', 'a', 'b')]

  it('节点悬于连线中段时命中该连线', () => {
    // A(40,30) -> B(440,30) 中点 (240,30)；节点矩形覆盖中点
    const hit = findConnectionInsertTarget(
      conns,
      getNode,
      { x: 200, y: 0, width: 80, height: 60 },
      'c',
      PAD,
    )
    expect(hit).toBe('c1')
  })

  it('节点不在连线上时不命中', () => {
    const hit = findConnectionInsertTarget(
      conns,
      getNode,
      { x: 200, y: 300, width: 80, height: 60 },
      'c',
      PAD,
    )
    expect(hit).toBeNull()
  })

  it('拖到端点节点上方时不命中', () => {
    const hit = findConnectionInsertTarget(
      conns,
      getNode,
      { x: 0, y: 0, width: 80, height: 60 },
      'c',
      PAD,
    )
    expect(hit).toBeNull()
  })

  it('涉及被拖节点的连线跳过（防御）', () => {
    const hit = findConnectionInsertTarget(
      [makeConn('c1', 'a', 'c')],
      (id) => (id === 'c' ? { x: 200, y: 0, width: 80, height: 60 } : nodes.get(id)),
      { x: 200, y: 0, width: 80, height: 60 },
      'c',
      PAD,
    )
    expect(hit).toBeNull()
  })

  it('端点节点缺失时跳过该连线', () => {
    const hit = findConnectionInsertTarget(
      [makeConn('c1', 'a', 'missing')],
      getNode,
      { x: 200, y: 0, width: 80, height: 60 },
      'c',
      PAD,
    )
    expect(hit).toBeNull()
  })
})
