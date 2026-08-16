import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, defineComponent, h, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useProjectStore } from '@/stores/project'
import { useAIWordPanel } from '@/composables/useAIWordPanel'

/** 构造 OpenAI 兼容成功响应 */
function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 重置 AI 共享单例状态 */
function resetAIState(): void {
  const p = useAIWordPanel()
  p.clear()
  p.previewText.value = ''
  p.sentenceText.value = ''
  p.mode.value = 'fast'
  p.generating.value = false
  p.regenerating.value = false
  p.sentenceLoading.value = false
}

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
    resetAIState()
  })

  // 必须显式 unmount，否则旧组件的 event listener 会污染后续测试
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
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

  it('I 键触发 useAIWordPanel.directGenerate（生成并展示到浮动面板）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('词A\n词B')))
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const target = nodeStore.addNode(project.currentNodeId, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')
    project.switchView(target)

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }))
    await vi.waitFor(() => expect(useAIWordPanel().visible.value).toBe(true))
    expect(useAIWordPanel().words.value).toEqual(['词A', '词B'])
  })

  it('C 键清除 AI 生成词状态', () => {
    const panel = useAIWordPanel()
    panel.show(['词'])
    expect(panel.visible.value).toBe(true)

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    expect(panel.visible.value).toBe(false)
  })

  it('Ctrl 组合键不触发 I/C（保留复制等快捷键）', () => {
    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    // 不应触发清除/生成，也不应抛错
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', ctrlKey: true }))
    expect(useAIWordPanel().visible.value).toBe(false)
  })

  it('isEditing 时不触发 I/C', () => {
    const isEditing = ref(true)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    expect(useAIWordPanel().visible.value).toBe(false)
  })
})
