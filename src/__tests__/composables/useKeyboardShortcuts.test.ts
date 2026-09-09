import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, defineComponent, h, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useProjectStore } from '@/stores/project'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { useModalStore } from '@/stores/modal'
import { useTagsStore } from '@/stores/tags'
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

  it('自定义快捷键：把 aiClear 由 c 重绑为 k 后，k 触发清除、c 失效', () => {
    const panel = useAIWordPanel()
    panel.show(['词'])
    expect(panel.visible.value).toBe(true)

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    // 默认 c：清除
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    expect(panel.visible.value).toBe(false)

    // 重绑 aiClear → k
    useShortcutsStore().assign('aiClear', 'k')

    panel.show(['词'])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }))
    expect(panel.visible.value).toBe(false)

    // 原 c 不再触发
    panel.show(['词'])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    expect(panel.visible.value).toBe(true)
  })

  it('序号修饰键改为 b 后，b+1 打标签', () => {
    const tag = useTagsStore().addTag('红')
    useShortcutsStore().setSeqModKey('b')

    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const id = nodeStore.addNode(project.currentNodeId, 0, 0)
    useViewStore('main').selectNode(id)

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'b' }))

    expect(nodeStore.getNode(id)?.tagIds).toContain(tag.id)
  })

  it('可自定义删除键：把 deleteSelected 由 d 改为 x 后，x 删除、d 不再删除', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    // 默认 d 删除
    const id1 = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(id1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
    expect(nodeStore.getNode(id1)).toBeUndefined()

    // 重绑 deleteSelected → x
    useShortcutsStore().assign('deleteSelected', 'x')

    const id2 = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(id2)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
    expect(nodeStore.getNode(id2)).toBeDefined() // d 不再删除
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))
    expect(nodeStore.getNode(id2)).toBeUndefined()
  })

  it('插件快捷键动作：注册 + 默认绑定生效后，派发 keydown 触发插件 run', () => {
    const run = vi.fn()
    useUiRegistryStore().registerPluginShortcutAction('demo', {
      id: 'act',
      label: '演示动作',
      scope: 'canvas',
      defaultChord: 'mod+shift+g',
      run,
    })

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    // mod+shift+g（默认键）触发插件 run（canvas scope，非编辑态可用）
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, shiftKey: true }))
    expect(run).toHaveBeenCalledTimes(1)

    // 用户经 assign 改键后，新键触发、旧键失效
    useShortcutsStore().assign('demo:act', 'mod+shift+h')
    run.mockClear()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true, shiftKey: true }))
    expect(run).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, shiftKey: true }))
    expect(run).toHaveBeenCalledTimes(1) // 旧键不再触发

    // 清理登记与覆盖，避免污染其它用例
    useUiRegistryStore().removePlugin('demo')
    useShortcutsStore().resetAll()
  })

  it('插件快捷键动作（canvas scope）：isEditing 时不触发（与内置守卫一致）', () => {
    const run = vi.fn()
    useUiRegistryStore().registerPluginShortcutAction('demo', {
      id: 'act',
      label: '演示动作',
      scope: 'canvas',
      defaultChord: 'mod+shift+g',
      run,
    })

    const isEditing = ref(true)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, shiftKey: true }))
    expect(run).not.toHaveBeenCalled()

    // 清理登记，避免污染其它用例
    useUiRegistryStore().removePlugin('demo')
    useShortcutsStore().resetAll()
  })

  it('插件快捷键动作（scope=always）：编辑态也触发', () => {
    const run = vi.fn()
    useUiRegistryStore().registerPluginShortcutAction('demo', {
      id: 'global',
      label: '全局演示动作',
      scope: 'always',
      defaultChord: 'mod+shift+k',
      run,
    })

    const isEditing = ref(true)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, shiftKey: true }))
    expect(run).toHaveBeenCalledTimes(1)

    // 清理登记，避免污染其它用例
    useUiRegistryStore().removePlugin('demo')
    useShortcutsStore().resetAll()
  })

  it('模态打开时 canvas scope 动作（Delete）不触发，close 后恢复', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const modal = useModalStore()

    const id = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(id)
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(1)

    // 模态打开（含 always 在内的全部 scope 一律抑制）
    expect(modal.open('settings')).toBe(true)

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(1) // 模态抑制，未删除

    // 关闭模态后恢复触发
    modal.close()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(0)
  })

  it('模态打开时 always scope 动作不触发，close 后恢复', () => {
    // 仿 save 类全局动作：注册 scope='always' 的插件动作观察 run 调用
    const run = vi.fn()
    useUiRegistryStore().registerPluginShortcutAction('demo', {
      id: 'global',
      label: '全局演示动作',
      scope: 'always',
      defaultChord: 'mod+shift+k',
      run,
    })

    const modal = useModalStore()
    expect(modal.open('settings')).toBe(true)

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    // 模态打开：always scope 也被抑制（与「编辑态仍触发」的既有行为不同）
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, shiftKey: true }))
    expect(run).not.toHaveBeenCalled()

    // close 后恢复触发
    modal.close()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, shiftKey: true }))
    expect(run).toHaveBeenCalledTimes(1)

    // 清理登记，避免污染其它用例
    useUiRegistryStore().removePlugin('demo')
    useShortcutsStore().resetAll()
  })
})
