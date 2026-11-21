// src/mcp/__tests__/registry.test.ts —— 工具登记表契约校验 + runTool 参数校验入口
import { describe, expect, it } from 'vitest'
import { RESOURCES, TOOLS, findTool, runTool } from '../registry'

describe('TOOLS 登记表契约', () => {
  it('恰好 22 个工具（T0–T21）', () => {
    expect(TOOLS).toHaveLength(22)
  })

  it('名称统一 aidea_ 前缀且唯一', () => {
    const names = TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name.startsWith('aidea_')).toBe(true)
  })

  it('每个工具都有英文描述与 object schema；title 为 i18n key', () => {
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(10)
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.title.startsWith('mcp.tools.')).toBe(true)
      expect(['read', 'write', 'danger']).toContain(tool.risk)
    }
  })

  it('窗口清单由 main 本地应答（handler 缺省），其余工具都有 handler', () => {
    for (const tool of TOOLS) {
      if (tool.name === 'aidea_windows_list') expect(tool.handler).toBeUndefined()
      else expect(tool.handler).toBeDefined()
    }
  })

  it('findTool 命中/未命中', () => {
    expect(findTool('aidea_board_overview')?.name).toBe('aidea_board_overview')
    expect(findTool('nope')).toBeUndefined()
  })
})

describe('RESOURCES 契约', () => {
  it('3 个 resource，uri 形如 aidea://…', () => {
    expect(RESOURCES).toHaveLength(3)
    for (const r of RESOURCES) expect(r.uri.startsWith('aidea://')).toBe(true)
  })
})

describe('runTool（统一执行入口）', () => {
  const ctx = { inBatch: false }

  it('未知工具 → 结构化错误', async () => {
    const r = await runTool('aidea_nope', {}, ctx)
    expect(r.ok).toBe(false)
  })

  it('参数校验失败 → 结构化错误（不抛异常）', async () => {
    const r = await runTool('aidea_node_get', {}, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('invalid arguments')
  })

  it('windows_list 无 handler → 结构化错误（main 本地应答，不经 renderer）', async () => {
    const r = await runTool('aidea_windows_list', {}, ctx)
    expect(r.ok).toBe(false)
  })
})
