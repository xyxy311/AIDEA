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

  it('装载真实 hello 后挂载不抛运行时错误', async () => {
    await usePluginStore().init()
    const wrapper = mount(PluginsSection)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.plugin-name').text()).toBe('示例插件')
    // 状态标签应渲染为已翻译的「已安装」，而非原始 key（如 plugin.statusInstalled）
    expect(wrapper.find('.plugin-tag').text()).toBe('已安装')
    expect(errorSpy).not.toHaveBeenCalled()
  })
})