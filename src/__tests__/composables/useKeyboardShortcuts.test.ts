import { describe, it, expect, beforeEach } from 'vitest'
import { ref, defineComponent, h, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useWhiteboardStore } from '@/stores/whiteboard'

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
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should delete selected node on Delete key', () => {
    const store = useWhiteboardStore()
    store.addNode(0, 0)
    expect(store.nodesArray.length).toBe(1)

    const isEditing = ref(false)
    mountWithShortcuts(isEditing)

    // Simulate Delete keydown
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(store.nodesArray.length).toBe(0)
  })

  it('should deselect on Escape key', () => {
    const store = useWhiteboardStore()
    store.addNode(0, 0)
    expect(store.selectedNodeId).not.toBeNull()

    const isEditing = ref(false)
    mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(store.selectedNodeId).toBeNull()
  })

  it('should NOT trigger shortcuts when isEditing is true', () => {
    const store = useWhiteboardStore()
    const id = store.addNode(0, 0)
    expect(store.nodesArray.length).toBe(1)

    const isEditing = ref(true)
    mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(store.nodesArray.length).toBe(1) // Should NOT delete

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(store.selectedNodeId).toBe(id) // Should NOT deselect
  })
})
