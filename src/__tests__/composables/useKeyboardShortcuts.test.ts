import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, defineComponent, h, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useCommands } from '@/composables/useCommands'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useProjectStore } from '@/stores/project'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { useModalStore } from '@/stores/modal'
import { useTagsStore } from '@/stores/tags'
import { useClipboard } from '@/composables/useClipboard'

/** 挂载无渲染组件以触发 composable 生命周期钩子 */
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

  it('方向键移动选中节点（ArrowDown y+100）且入历史可撤销', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const commands = useCommands()

    const id = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(id)
    expect(commands.canUndo.value).toBe(false)

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    // y + 100（步进 GRID_G），x 不变
    expect(nodeStore.getNode(id)!.y).toBe(100)
    expect(nodeStore.getNode(id)!.x).toBe(0)
    // 移动已入历史栈，可撤销
    expect(commands.canUndo.value).toBe(true)
  })

  it('Enter 编辑选中节点（editingNodeId = 选中节点 id）', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')

    const id = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(id)
    expect(view.editingNodeId).toBeNull()

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(view.editingNodeId).toBe(id)
  })

  it('无选中按 Enter 无效果（不新建、不编辑）', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(view.editingNodeId).toBeNull()
    expect(view.selectedNodeId).toBeNull()
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(0)
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

  it('mod+c 复制选中节点入剪贴板（canPaste=true）', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')

    const id = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(id)

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    expect(useClipboard().canPaste.value).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))
    expect(useClipboard().canPaste.value).toBe(true)
  })

  it('mod+v 粘贴剪贴板内容到当前视图（出现新顶层节点）', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')

    const id = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(id)

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }))
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(2)
  })

  it('mod+x 剪切：删原节点且剪贴板保留；mod+z 撤销恢复；mod+shift+z 重做再删', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')

    const id = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(id)

    const isEditing = ref(false)
    wrapper = mountWithShortcuts(isEditing)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true }))
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(0)
    expect(useClipboard().canPaste.value).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }))
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(0)
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
