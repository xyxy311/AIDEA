import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PluginsSection from '@/components/settings/PluginsSection.vue'
import { usePluginStore } from '@/stores/plugin'

describe('PluginsSection（插件管理栏目）挂载冒烟', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    setActivePinia(createPinia())
    // 内置 glob 源已废除：测试环境无桥 → 走 web 静态清单源，stub fetch 返回空清单（空集路径）
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })))
  })
  afterEach(() => {
    errorSpy.mockClear()
    vi.unstubAllGlobals()
  })

  it('空插件清单（无桥 + 清单为空）下挂载不抛运行时错误', async () => {
    await usePluginStore().init()
    const wrapper = mount(PluginsSection)
    await wrapper.vm.$nextTick()
    // 空集：无插件行、无状态标签（渲染 NEmpty 空态）
    const names = wrapper.findAll('.plugin-name').map((n) => n.text())
    expect(names).toHaveLength(0)
    // 状态标签应随清单为空而消失（原「已安装」标签仅在有插件记录时渲染）
    const tags = wrapper.findAll('.plugin-tag').map((n) => n.text())
    expect(tags).toHaveLength(0)
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
