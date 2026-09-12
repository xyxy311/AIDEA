import { describe, it, expect } from 'vitest'
import { clampFloatingOffset } from '@/utils/floatingWindow'

/**
 * clampFloatingOffset（浮动窗口越界钳制纯函数）单测。
 *
 * 定位模型：窗口中心 = 视口中心 + offset → 窗口矩形 left = vw/2 + ox - w/2。
 * 「窗口完整落在视口内」⇔ ox ∈ [(w - vw)/2, (vw - w)/2]（y 轴同理）。
 */
describe('clampFloatingOffset（浮动窗口越界钳制）', () => {
  it('正常范围：界内偏移原样返回（不做任何改动）', () => {
    // 视口 800x600，窗口 300x200：x ∈ [-250, 250]，y ∈ [-200, 200]
    expect(clampFloatingOffset(800, 600, 300, 200, 50, 50)).toEqual({ x: 50, y: 50 })
    expect(clampFloatingOffset(800, 600, 300, 200, -100, -150)).toEqual({ x: -100, y: -150 })
    // 零偏移（首次打开）→ 幂等
    expect(clampFloatingOffset(800, 600, 300, 200, 0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('贴边：偏移恰好使窗口右/下缘贴住视口边（区间端点）→ 原样返回', () => {
    // ox = (vw - w)/2 = 250：right = 800/2 + 250 + 150 = 800 = vw（贴右）
    // oy = (vh - h)/2 = 200：bottom = 300 + 200 + 100 = 600 = vh（贴下）
    expect(clampFloatingOffset(800, 600, 300, 200, 250, 200)).toEqual({ x: 250, y: 200 })
    // 贴左 / 贴上（区间另一端）
    expect(clampFloatingOffset(800, 600, 300, 200, -250, -200)).toEqual({ x: -250, y: -200 })
  })

  it('超界：拖出视口的偏移被拉回区间端点（窗口始终完整可见、关闭入口可触及）', () => {
    // 向右下拖出很远 → 钳到贴右/下
    expect(clampFloatingOffset(800, 600, 300, 200, 5000, 9999)).toEqual({ x: 250, y: 200 })
    // 向左上拖出很远 → 钳到贴左/上
    expect(clampFloatingOffset(800, 600, 300, 200, -5000, -9999)).toEqual({ x: -250, y: -200 })
    // 一轴超界另一轴在界内：只钳超界轴
    expect(clampFloatingOffset(800, 600, 300, 200, 5000, 30)).toEqual({ x: 250, y: 30 })
  })

  it('尺寸 ≥ 视口退化居中：某轴窗口放不下（min > max 颠倒）→ 该轴取 0', () => {
    // 窗口 900x700 大于视口 800x600：两轴都无法完整容纳 → 双轴居中
    expect(clampFloatingOffset(800, 600, 900, 700, 120, -80)).toEqual({ x: 0, y: 0 })
    // 仅一轴超：宽度 900 ≥ 800 的轴居中，高度轴正常钳制
    expect(clampFloatingOffset(800, 600, 900, 200, 120, -80)).toEqual({ x: 0, y: -80 })
  })

  it('尺寸 === 视口：min === max === 0 → 该轴恒为居中（区间收缩为单点）', () => {
    expect(clampFloatingOffset(800, 600, 800, 600, 55, -55)).toEqual({ x: 0, y: 0 })
    expect(clampFloatingOffset(800, 600, 800, 300, 55, -55)).toEqual({ x: 0, y: -55 })
  })

  it('窗口尺寸为 0（jsdom/happy-dom 无布局）：约束区间退化为 ±视口/2，实际不构成限制', () => {
    // w=0：x ∈ [-400, 400]，常见拖动偏移原样通过（自然语义，无需特判）
    expect(clampFloatingOffset(800, 600, 0, 0, 100, -100)).toEqual({ x: 100, y: -100 })
    // 极端偏移仍被钳在 ±视口/2（x±400 / y±300；零尺寸窗口的中心不会跑出视口）
    expect(clampFloatingOffset(800, 600, 0, 0, 5000, -5000)).toEqual({ x: 400, y: -300 })
  })

  it('视口尺寸为 0（异常环境保护）：窗口放不下 → 退化为居中，不产生 NaN/Infinity', () => {
    expect(clampFloatingOffset(0, 0, 300, 200, 50, 50)).toEqual({ x: 0, y: 0 })
    expect(clampFloatingOffset(0, 600, 300, 200, 50, 50)).toEqual({ x: 0, y: 50 })
  })
})
