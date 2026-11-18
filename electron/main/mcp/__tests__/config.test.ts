// @vitest-environment node
// electron/main/mcp/__tests__/config.test.ts —— mcp.json 配置归一/补丁校验单测（纯函数，不触真实 fs）
import { describe, expect, it } from 'vitest'
import { applyPatch, defaultConfig, normalizeConfig } from '../config'

describe('normalizeConfig（防御性归一）', () => {
  it('非法输入 → 默认配置（enabled=false）', () => {
    for (const raw of [null, 'str', 42, [], undefined]) {
      const config = normalizeConfig(raw)
      expect(config.enabled).toBe(false)
      expect(config.port).toBe(9876)
      expect(config.token.length).toBeGreaterThan(16)
    }
  })

  it('越界值收敛、enabled 仅认 true', () => {
    const config = normalizeConfig({
      enabled: 'yes',
      port: 80, // 低于 1024 → 回落默认
      token: 'short', // 过短 → 重新生成
      limits: { maxConcurrent: 9999, toolTimeoutMs: 1 },
    })
    expect(config.enabled).toBe(false)
    expect(config.port).toBe(9876)
    expect(config.token.length).toBeGreaterThan(16)
    expect(config.limits.maxConcurrent).toBe(64)
    expect(config.limits.toolTimeoutMs).toBe(1000)
  })

  it('合法值保留', () => {
    const config = normalizeConfig({
      enabled: true,
      port: 9000,
      token: 'a'.repeat(32),
      limits: { maxOpsPerBatch: 50 },
    })
    expect(config.enabled).toBe(true)
    expect(config.port).toBe(9000)
    expect(config.token).toBe('a'.repeat(32))
    expect(config.limits.maxOpsPerBatch).toBe(50)
    expect(config.limits.maxNodesPerCreate).toBe(200)
  })
})

describe('applyPatch（补丁校验）', () => {
  it('空补丁 → 原配置', () => {
    const prev = defaultConfig()
    const r = applyPatch(prev, {})
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.config).toEqual(prev)
  })

  it('enabled/port 合法更新', () => {
    const r = applyPatch(defaultConfig(), { enabled: true, port: 9001 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.config.enabled).toBe(true)
      expect(r.config.port).toBe(9001)
    }
  })

  it('非法 port / enabled / token 报错不静默', () => {
    expect(applyPatch(defaultConfig(), { port: 80 }).ok).toBe(false)
    expect(applyPatch(defaultConfig(), { port: 1.5 }).ok).toBe(false)
    expect(applyPatch(defaultConfig(), { enabled: 'true' as unknown as boolean }).ok).toBe(false)
    expect(applyPatch(defaultConfig(), { token: 'short' }).ok).toBe(false)
  })

  it('regenerateToken 忽略 token 字段并重新生成', () => {
    const prev = defaultConfig()
    const r = applyPatch(prev, { regenerateToken: true, token: 'b'.repeat(40) })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.config.token).not.toBe(prev.token)
      expect(r.config.token).not.toBe('b'.repeat(40))
      expect(r.config.token.length).toBeGreaterThan(16)
    }
  })

  it('limits 部分更新 + 越界报错', () => {
    const r = applyPatch(defaultConfig(), { limits: { maxConcurrent: 8 } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.config.limits.maxConcurrent).toBe(8)
      expect(r.config.limits.maxOpsPerBatch).toBe(100)
    }
    expect(applyPatch(defaultConfig(), { limits: { maxConcurrent: 0 } }).ok).toBe(false)
  })

  it('原配置不被修改（纯函数）', () => {
    const prev = defaultConfig()
    const snapshot = JSON.parse(JSON.stringify(prev))
    applyPatch(prev, { enabled: true, port: 9000, limits: { maxConcurrent: 8 } })
    expect(prev).toEqual(snapshot)
  })
})
