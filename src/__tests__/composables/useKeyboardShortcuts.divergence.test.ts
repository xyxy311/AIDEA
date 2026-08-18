import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, defineComponent, h, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useProjectStore } from '@/stores/project'

// 用 vi.hoisted Mock useAIWordPanel，隔离真实 fetch 与共享单例，聚焦 I 键分流逻辑
const mocks = vi.hoisted(() => ({
  generateDirectional: vi.fn(),
  directGenerate: vi.fn(),
  clear: vi.fn(),
}))

vi.mock('@/composables/useAIWordPanel', () => ({
  useAIWordPanel: () => ({
    generateDirectional: mocks.generateDirectional,
    directGenerate: mocks.directGenerate,
    clear: mocks.clear,
  }),
}))

/** Mount 一个无渲染组件，确保 onMounted/onUnmounted 生命周期钩子触发 */
function mountWithShortcuts(isEditing: Ref<boolean>) {
  return mount(
    defineComponent({
      setup() {
        useKeyboardShortcuts(isEditing)
        return () => h('div')
      },
    }),
  )
}

describe('useKeyboardShortcuts I 键定向发散分流', () => {
  let wrapper: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.generateDirectional.mockReset()
    mocks.directGenerate.mockReset()
  })

  // 必须显式 unmount，否则旧组件的 event listener 会污染后续测试
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('有选中节点时 I 键仍调 directGenerate（任意发散），不调 generateDirectional', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const id = nodeStore.addNode(project.currentNodeId, 0, 0, '起点')
    view.selectNode(id)

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }))
    expect(mocks.directGenerate).toHaveBeenCalledTimes(1)
    expect(mocks.generateDirectional).not.toHaveBeenCalled()
  })

  it('无选中时 I 键调 directGenerate', () => {
    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }))
    expect(mocks.directGenerate).toHaveBeenCalledTimes(1)
    expect(mocks.generateDirectional).not.toHaveBeenCalled()
  })
})