/**
 * source.test.ts —— 经 @/plugin/manager 引入面的插件收集冒烟
 *
 * 内置 glob 源已废除：无桥（测试环境）→ web 静态清单源，stub fetch 提供清单响应。
 * loader 指向 /plugins/<id>/<entry> 根相对 URL，真实加载属 E2E 面，单测只验收集形状。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectPluginEntries, pluginIdFromPath } from '@/plugin/manager'

describe('插件收集（sources/ 聚合收口）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('无桥（web 形态）→ fetch 静态清单装载，ai 按清单 id 路由（source: local）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => [{ id: 'ai', entry: 'plugin.js' }],
      })),
    )
    const entries = await collectPluginEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.id).toBe('ai')
    expect(entries[0]!.source).toBe('local')
    // loader 存在即可，不在此调用：根相对 URL 的真实加载属 E2E 面
    expect(typeof entries[0]!.loader).toBe('function')
  })

  it('pluginIdFromPath 从路径推断插件 id（manager 本地定义，历史 glob 工具保留）', () => {
    expect(pluginIdFromPath('/plugins/ai/index.ts')).toBe('ai')
    expect(pluginIdFromPath('stats/index.vue')).toBe('stats')
    expect(pluginIdFromPath('/a/b')).toBe('/a/b')
  })
})
