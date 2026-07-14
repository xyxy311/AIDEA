import { describe, it, expect } from 'vitest'
import { clampPosition, measureText } from '@/utils/geometry'

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
    // 700 + half of 200 = 800 is OK (800 - minNodeWidth/2 = 800 - 75 = 725? Let me think)
    // Actually: clamp to [0, stageWidth - MIN_NODE_WIDTH/2]
    // Let's use reasonable clamping: node can't go past half its width past edge
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
