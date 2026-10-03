import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import AIPanel from '../components/AIPanel.vue'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useProjectStore } from '@/stores/project'

/**
 * AIPanel 挂载冒烟：回归保障——面板在「当前视图无子节点」时也必须渲染完整表单
 *（此前空态拦截删除后，误用无指令的 <template> 包住 NScrollbar 插槽，导致整面板空白）。
 * 断言：无子节点时仍渲染出非空内容且无运行时错误。
 */
// 用 vi.hoisted Mock 插件内 useAIDirectionsStore，隔离真实持久化输入
const dirMocks = vi.hoisted(() => ({ getDefaultDirection: vi.fn() }))
vi.mock('../stores/aiDirections', () => ({
  useAIDirectionsStore: () => ({ getDefaultDirection: dirMocks.getDefaultDirection }),
}))

describe('AIPanel 挂载冒烟', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    const registry = useUiRegistryStore()
    if (!registry.floatingLayers.has('ai:words')) {
      registry.registerPluginFloatingLayer('ai', {
        id: 'words',
        component: defineComponent(() => () => h('div')),
      })
    }
    const nodeStore = useNodeStore()
    nodeStore.getNode(ROOT_NODE_ID)!.text = '项目'
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '空视图')
    useProjectStore().switchView(target)
  })

  afterEach(() => {
    errorSpy.mockClear()
  })

  it('当前视图无子节点：仍渲染完整面板（非空白、无运行时错误）', () => {
    const wrapper = mount(AIPanel)
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.text().length).toBeGreaterThan(0)
    expect(errorSpy).not.toHaveBeenCalled()
  })
})