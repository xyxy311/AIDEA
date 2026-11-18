/**
 * mcp/schema.ts —— 最小 JSON Schema 校验器（零依赖）。
 * 覆盖工具入参面：type / properties / required / enum / items / minimum / maximum /
 * minItems / maxItems / additionalProperties。返回结构化错误列表（不抛异常）。
 */
import type { McpJsonSchema } from './types'

export interface SchemaIssue {
  /** 点分路径（如 'updates.0.text'） */
  path: string
  message: string
}

export type SchemaCheckResult =
  | { ok: true }
  | { ok: false; issues: SchemaIssue[] }

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (Number.isInteger(value)) return 'integer'
  if (typeof value === 'number') return 'number'
  return typeof value
}

function typeAccepts(expected: string | string[], actual: string): boolean {
  const expectedList = Array.isArray(expected) ? expected : [expected]
  return expectedList.some((expected) => {
    if (expected === actual) return true
    if (expected === 'number' && actual === 'integer') return true
    return false
  })
}

/** 递归校验 value 是否满足 schema */
function check(value: unknown, schema: McpJsonSchema, path: string, issues: SchemaIssue[]): void {
  if (schema.type !== undefined && !typeAccepts(schema.type, typeOf(value))) {
    issues.push({ path, message: `expected ${Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type}, got ${typeOf(value)}` })
    return
  }
  if (schema.enum !== undefined && !schema.enum.some((option) => option === value)) {
    issues.push({ path, message: `expected one of ${schema.enum.map((o) => JSON.stringify(o)).join(', ')}` })
    return
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({ path, message: `must be at least ${schema.minLength} characters` })
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push({ path, message: `must be at most ${schema.maxLength} characters` })
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({ path, message: `must be >= ${schema.minimum}` })
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({ path, message: `must be <= ${schema.maximum}` })
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({ path, message: `must have at least ${schema.minItems} items` })
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issues.push({ path, message: `must have at most ${schema.maxItems} items` })
    }
    if (schema.items) {
      value.forEach((item, i) => check(item, schema.items!, `${path}.${i}`, issues))
    }
    return
  }
  if (typeOf(value) === 'object') {
    const obj = value as Record<string, unknown>
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(obj)) {
        if (!(key in schema.properties)) {
          issues.push({ path: `${path}.${key}`, message: 'unknown property' })
        }
      }
    }
    for (const key of schema.required ?? []) {
      if (!(key in obj)) {
        issues.push({ path: `${path}.${key}`, message: 'missing required property' })
      }
    }
    for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
      if (key in obj) check(obj[key], propSchema, `${path}.${key}`, issues)
    }
  }
}

/** 校验 args 是否满足工具入参 schema */
export function validateArgs(args: unknown, schema: McpJsonSchema): SchemaCheckResult {
  const issues: SchemaIssue[] = []
  check(args, schema, '', issues)
  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}
