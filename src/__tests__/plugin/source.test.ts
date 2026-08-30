import { describe, expect, it } from 'vitest'
import { StaticPluginSource, pluginIdFromPath } from '@/plugin/source'

describe('StaticPluginSource', () => {
  it('从编译期 glob 扫描到示例插件 hello，并按 id 路由', async () => {
    const entries = new StaticPluginSource().list()
    expect(entries.length).toBeGreaterThan(0)

    const hello = entries.find((e) => e.id === 'hello')
    expect(hello).toBeDefined()

    const mod = await hello!.loader()
    expect(mod.default?.manifest.id).toBe('hello')
    expect(mod.default?.setup).toBeTypeOf('function')
  })

  it('pluginIdFromPath 从路径推断插件 id', () => {
    expect(pluginIdFromPath('/plugins/hello/index.ts')).toBe('hello')
    expect(pluginIdFromPath('stats/index.vue')).toBe('stats')
    expect(pluginIdFromPath('/a/b')).toBe('/a/b')
  })
})