/**
 * source.test.ts —— 经 @/plugin/manager 引入面的插件收集冒烟
 *
 * 项目已收敛为纯 Electron 桌面形态：插件收集恒走桌面源（桥扫描 + aidea-plugin:
 * 协议装载），其聚合行为见 sources.test.ts。本文件保留 manager 层面的本地实用
 * 函数测试。loader 的真实加载属 E2E 面，单测只验形状。
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