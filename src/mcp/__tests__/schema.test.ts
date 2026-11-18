// src/mcp/__tests__/schema.test.ts —— 最小 JSON Schema 校验器单测
import { describe, expect, it } from 'vitest'
import { validateArgs } from '../schema'
import type { McpJsonSchema } from '../types'

describe('validateArgs（type 与必填）', () => {
  const schema: McpJsonSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      mode: { type: 'string', enum: ['all', 'text'] },
    },    required: ['query'],
    additionalProperties: false,
  }

  it('合法入参通过', () => {
    expect(validateArgs({ query: 'a', limit: 5 }, schema)).toEqual({ ok: true })
  })

  it('缺必填报错', () => {
    const r = validateArgs({}, schema)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.some((i) => i.path === '.query')).toBe(true)
  })

  it('类型不符报错（number 传给 integer 可接受整数）', () => {
    expect(validateArgs({ query: 'a', limit: 5.5 }, schema).ok).toBe(false)
    expect(validateArgs({ query: 'a', limit: 5 }, schema).ok).toBe(true)
  })

  it('enum 越界报错', () => {
    expect(validateArgs({ query: 'a', mode: 'bogus' }, schema).ok).toBe(false)
  })

  it('数值越界报错', () => {
    expect(validateArgs({ query: 'a', limit: 0 }, schema).ok).toBe(false)
    expect(validateArgs({ query: 'a', limit: 101 }, schema).ok).toBe(false)
  })

  it('additionalProperties=false 拒绝未知键', () => {
    const r = validateArgs({ query: 'a', extra: 1 }, schema)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.some((i) => i.path === '.extra')).toBe(true)
  })
})

describe('validateArgs（嵌套与数组）', () => {
  const schema: McpJsonSchema = {
    type: 'object' as const,
    properties: {
      updates: {
        type: 'array',
        minItems: 1,
        maxItems: 2,
        items: {
          type: 'object',
          properties: { nodeId: { type: 'string' }, text: { type: 'string' } },
          required: ['nodeId', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['updates'],
  }

  it('数组元素逐项校验，路径点分定位', () => {
    const r = validateArgs({ updates: [{ nodeId: 'a', text: 'x' }, { nodeId: 'b' }] }, schema)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.some((i) => i.path === '.updates.1.text')).toBe(true)
  })

  it('minItems / maxItems 生效', () => {
    expect(validateArgs({ updates: [] }, schema).ok).toBe(false)
    expect(
      validateArgs(
        { updates: [{ nodeId: 'a', text: 'x' }, { nodeId: 'b', text: 'y' }, { nodeId: 'c', text: 'z' }] },
        schema,
      ).ok,
    ).toBe(false)
  })

  it('根级非 object 报错', () => {
    expect(validateArgs('nope', { type: 'object' }).ok).toBe(false)
  })

  it('空 schema 恒通过', () => {
    expect(validateArgs({ anything: [1, 2] }, {}).ok).toBe(true)
  })
})
