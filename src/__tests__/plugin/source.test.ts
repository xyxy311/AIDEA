/**
 * source.test.ts —— 经 @/plugin/manager 引入面的插件收集冒烟：验证 pluginIdFromPath 等本地实用函数。
 */
import { describe, expect, it } from 'vitest'
import { pluginIdFromPath } from '@/plugin/manager'

describe('pluginIdFromPath 从路径推断插件 id（manager 本地定义）', () => {
  it('常规路径', () => {
    expect(pluginIdFromPath('/plugins/ai/index.ts')).toBe('ai')
    expect(pluginIdFromPath('stats/index.vue')).toBe('stats')
    expect(pluginIdFromPath('/a/b')).toBe('/a/b')
  })
})