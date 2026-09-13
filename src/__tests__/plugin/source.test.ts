import { describe, expect, it } from 'vitest'
import { collectPluginEntries, pluginIdFromPath } from '@/plugin/manager'

describe('插件收集（sources/ 聚合收口）', () => {
  it('从编译期 glob 扫描到内置插件 ai，并按 id 路由（happy-dom 无桥 → 仅内置源）', async () => {
    const entries = await collectPluginEntries()
    expect(entries.length).toBeGreaterThan(0)

    const ai = entries.find((e) => e.id === 'ai')
    expect(ai).toBeDefined()

    const mod = await ai!.loader()
    expect(mod.default?.manifest.id).toBe('ai')
    expect(mod.default?.setup).toBeTypeOf('function')
  })

  it('无桌面桥（web 形态）→ 全部条目来源均为 builtin', async () => {
    const entries = await collectPluginEntries()
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.source === 'builtin')).toBe(true)
  })

  it('pluginIdFromPath 从路径推断插件 id', () => {
    expect(pluginIdFromPath('/plugins/ai/index.ts')).toBe('ai')
    expect(pluginIdFromPath('stats/index.vue')).toBe('stats')
    expect(pluginIdFromPath('/a/b')).toBe('/a/b')
  })
})
