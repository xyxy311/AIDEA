import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PluginsSection from '@/components/settings/PluginsSection.vue'
import { usePluginStore } from '@/stores/plugin'

describe('PluginsSection（插件管理栏目）挂载冒烟', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    errorSpy.mockClear()
  })

  it('装载全部内置插件后挂载不抛运行时错误', async () => {
    await usePluginStore().init()
    const wrapper = mount(PluginsSection)
    await wrapper.vm.$nextTick()
    // 插件清单应含内置的 ai 插件（「AI 发散」）
    const names = wrapper.findAll('.plugin-name').map((n) => n.text())
    expect(names).toContain('AI 发散')
    // 状态标签应渲染为已翻译的「已安装」，而非原始 key（如 plugin.statusInstalled）
    const tags = wrapper.findAll('.plugin-tag').map((n) => n.text())
    expect(tags.length).toBeGreaterThan(0)
    for (const tag of tags) {
      expect(tag).toBe('已安装')
    }
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
