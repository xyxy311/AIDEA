import { describe, it, expect } from 'vitest'
import { generateId } from '@/utils/id'

describe('generateId', () => {
  it('should return a non-empty string', () => {
    const id = generateId()
    expect(id).toBeTruthy()
    expect(typeof id).toBe('string')
  })

  it('should generate unique IDs on each call', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })

  it('should generate IDs with at least 8 characters', () => {
    const id = generateId()
    expect(id.length).toBeGreaterThanOrEqual(8)
  })
})
