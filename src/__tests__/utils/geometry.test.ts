import { describe, it, expect } from 'vitest'
import { clampPosition, measureText, calculateTextContentSize } from '@/utils/geometry'

describe('clampPosition', () => {
  it('should return original position when within canvas bounds', () => {
    const result = clampPosition(100, 100, 800, 600, 200, 120)
    expect(result).toEqual({ x: 100, y: 100 })
  })

  it('should clamp x to 0 when node would go off left edge', () => {
    const result = clampPosition(-50, 100, 800, 600, 200, 120)
    expect(result.x).toBe(0)
    expect(result.y).toBe(100)
  })

  it('should clamp x to canvas width minus min width when node goes off right edge', () => {
    const result = clampPosition(700, 100, 800, 600, 200, 120)
    expect(result.x).toBeLessThanOrEqual(800 - 150 / 2) // 725
  })

  it('should clamp y to 0 when node goes off top edge', () => {
    const result = clampPosition(100, -30, 800, 600, 200, 120)
    expect(result.y).toBe(0)
  })
})

describe('measureText', () => {
  it('should return an object with width and height properties', () => {
    const result = measureText('Hello', 16)
    expect(result).toHaveProperty('width')
    expect(result).toHaveProperty('height')
  })

  it('should return larger width for longer text', () => {
    const short = measureText('Hi', 16)
    const long = measureText('Hello, World! This is longer text', 16)
    expect(long.width).toBeGreaterThan(short.width)
  })

  it('should return larger dimensions for larger font size', () => {
    const small = measureText('Hello', 12)
    const large = measureText('Hello', 24)
    expect(large.width).toBeGreaterThan(small.width)
    expect(large.height).toBeGreaterThan(small.height)
  })
})

describe('calculateTextContentSize', () => {
  const fontSize = 16
  const fontFamily = 'system-ui, sans-serif'
  const lineHeight = 1.5
  const lineH = Math.ceil(fontSize * lineHeight) // 24

  it('空文本返回一行高度，宽度为 0', () => {
    const result = calculateTextContentSize('', fontSize, fontFamily, 200, lineHeight)
    expect(result.width).toBe(0)
    expect(result.height).toBe(lineH)
  })

  it('短文本不换行时返回单行高度', () => {
    const result = calculateTextContentSize('Hi', fontSize, fontFamily, 1000, lineHeight)
    expect(result.height).toBe(lineH)
    expect(result.width).toBeGreaterThan(0)
  })

  it('文本超出 maxWidth 时换行，高度增加', () => {
    const short = calculateTextContentSize('Hi', fontSize, fontFamily, 1000, lineHeight)
    const long = calculateTextContentSize(
      'This is a very long text that should wrap multiple times',
      fontSize,
      fontFamily,
      30,
      lineHeight,
    )
    expect(long.height).toBeGreaterThan(short.height)
    expect(long.height).toBeGreaterThan(lineH)
  })

  it('显式换行符分割为多行', () => {
    const result = calculateTextContentSize('A\nB\nC', fontSize, fontFamily, 1000, lineHeight)
    // 3 段，每段不换行 -> 3 行
    expect(result.height).toBe(lineH * 3)
  })

  it('连续换行符产生空行', () => {
    const result = calculateTextContentSize('A\n\nB', fontSize, fontFamily, 1000, lineHeight)
    // 'A' / '' / 'B' -> 3 行
    expect(result.height).toBe(lineH * 3)
  })

  it('中文文本宽度大于同等长度英文', () => {
    const en = calculateTextContentSize('abc', fontSize, fontFamily, 1000, lineHeight)
    const zh = calculateTextContentSize('你好世', fontSize, fontFamily, 1000, lineHeight)
    expect(zh.width).toBeGreaterThan(en.width)
  })

  it('maxWidth 极小时不崩溃，每个字符单独成行', () => {
    const result = calculateTextContentSize('Hello', fontSize, fontFamily, 1, lineHeight)
    expect(result.height).toBeGreaterThan(0)
    expect(result.width).toBeGreaterThan(0)
    // 每个字符单独成行 -> 5 行
    expect(result.height).toBe(lineH * 5)
  })

  it('更长文本在相同 maxWidth 下高度更大', () => {
    const medium = calculateTextContentSize('Hello World', fontSize, fontFamily, 40, lineHeight)
    const longer = calculateTextContentSize(
      'Hello World Foo Bar Baz',
      fontSize,
      fontFamily,
      40,
      lineHeight,
    )
    expect(longer.height).toBeGreaterThan(medium.height)
  })

  it('更大字号产生更大尺寸', () => {
    const small = calculateTextContentSize('Test', 12, fontFamily, 1000, lineHeight)
    const large = calculateTextContentSize('Test', 24, fontFamily, 1000, lineHeight)
    expect(large.width).toBeGreaterThan(small.width)
    expect(large.height).toBeGreaterThan(small.height)
  })
})
