import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PluginsSection from '@/components/settings/PluginsSection.vue'
import { usePluginStore } from '@/stores/plugin'

describe('PluginsSection（插件管理栏目）挂载冒烟', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    setActivePinia(createPinia())
    // 纯桌面形态：test/setup.ts 预置的默认桥返回空插件集（空集路径，installAll 空转）
  })
  afterEach(() => {
    errorSpy.mockClear()
  })

  it('空插件清单下挂载不抛运行时错误', async () => {
    await usePluginStore().init()
    const wrapper = mount(PluginsSection)
    await wrapper.vm.$nextTick()
    // 空集：无插件行、无状态标签（渲染 NEmpty 空态）
    const names = wrapper.findAll('.plugin-name').map((n) => n.text())
    expect(names).toHaveLength(0)
    // 状态标签应随插件集为空而消失
    const tags = wrapper.findAll('.plugin-tag').map((n) => n.text())
    expect(tags).toHaveLength(0)
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
