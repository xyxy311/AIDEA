import { describe, expect, it } from 'vitest'
import { collectPluginEntries, pluginIdFromPath } from '@/plugin/manager'

describe('静态插件收集（原 StaticPluginSource，并入 manager）', () => {
  it('从编译期 glob 扫描到内置插件 ai，并按 id 路由', async () => {
    const entries = collectPluginEntries()
    expect(entries.length).toBeGreaterThan(0)

    const ai = entries.find((e) => e.id === 'ai')
    expect(ai).toBeDefined()

    const mod = await ai!.loader()
    expect(mod.default?.manifest.id).toBe('ai')
    expect(mod.default?.setup).toBeTypeOf('function')
  })

  it('pluginIdFromPath 从路径推断插件 id', () => {
    expect(pluginIdFromPath('/plugins/ai/index.ts')).toBe('ai')
    expect(pluginIdFromPath('stats/index.vue')).toBe('stats')
    expect(pluginIdFromPath('/a/b')).toBe('/a/b')
  })
})