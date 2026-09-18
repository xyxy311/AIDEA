/**
 * PluginsSection 目录变更徽标渲染测试（M2，可选覆盖）
 *
 * 真实 pinia（非 createTestingPinia）+ mount：dirDirty 是 store 的普通 state，
 * 直接赋值即可驱动响应式渲染。徽标由 dirDirty 置位驱动（桌面桥推送置位；
 * web 恒 false → 不渲染），此处只验证「置位 → 徽标出现 + 文案正确」。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PluginsSection from '@/components/settings/PluginsSection.vue'
import { usePluginStore } from '@/stores/plugin'

describe('PluginsSection 目录变更徽标（dirDirty）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('dirDirty=false → 不渲染徽标；置 true → 渲染「目录有变更」', async () => {
    const wrapper = mount(PluginsSection)
    const store = usePluginStore()

    // 初始（含 web 形态语义）：无桥推送 → 徽标不出现
    expect(store.dirDirty).toBe(false)
    expect(wrapper.find('.plugin-dirty').exists()).toBe(false)

    // 模拟桥推送后的置位 → 徽标出现且文案来自 plugin.dirDirty
    store.dirDirty = true
    await wrapper.vm.$nextTick()
    const badge = wrapper.find('.plugin-dirty')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('目录有变更')
  })
})
