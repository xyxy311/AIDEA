import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ref, defineComponent, h, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useProjectStore } from '@/stores/project'

/**
 * Helper: Mount a renderless component that calls the composable in setup,
 * ensuring onMounted/onUnmounted lifecycle hooks fire correctly.
 */
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

describe('useKeyboardShortcuts', () => {
  let wrapper: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // 必须显式 unmount，否则旧组件的 event listener 会污染后续测试
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('should delete selected node on Delete key', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')

    const id = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(id)
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(1)

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(0)
  })

  it('should deselect on Escape key', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')

    const id = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(id)
    expect(view.selectedNodeId).not.toBeNull()

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(view.selectedNodeId).toBeNull()
  })

  it('should NOT trigger shortcuts when isEditing is true', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')

    const id = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(id)
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(1)

    const isEditing = ref(true)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(1) // Should NOT delete

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(view.selectedNodeId).toBe(id) // Should NOT deselect
  })
})
