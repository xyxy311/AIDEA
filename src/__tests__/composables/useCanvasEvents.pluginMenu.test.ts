import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCanvasEvents } from '@/composables/useCanvasEvents'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useProjectStore } from '@/stores/project'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { AIDivergenceDirection } from '@/types/ai'

// 用 vi.hoisted 在模块顶层声明可复用的 mock，供 vi.mock 与测试内部共享
const mocks = vi.hoisted(() => {
  const directions: AIDivergenceDirection[] = []
  return {
    directions,
    generateDirectional: vi.fn(),
  }
})

vi.mock('@/composables/useAIWordPanel', () => ({
  useAIWordPanel: () => ({ generateDirectional: mocks.generateDirectional }),
}))

vi.mock('@/stores/aiDirections', () => ({
  useAIDirectionsStore: () => ({
    directionList: mocks.directions,
  }),
}))

/** 构造右键菜单事件（提供 preventDefault 与 clientX/clientY） */
function mockContextMenuEvent(): KonvaEventObject<MouseEvent> {
  return {
    evt: { preventDefault: vi.fn(), clientX: 100, clientY: 100 },
  } as unknown as KonvaEventObject<MouseEvent>
}

/** 清空插件两表登记，避免用例间残留 */
function clearPluginRegistry(): void {
  const registry = useUiRegistryStore()
  registry.removePlugin('demo')
  registry.removePlugin('other')
}

describe('useCanvasEvents 插件右键菜单项（uiRegistry.contextMenuItems）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.generateDirectional.mockReset()
    clearPluginRegistry()
  })

  it('有选中节点时菜单末尾含 selection 项，action 调 run 且收到 selectedNodeIds 展开拷贝', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const id1 = nodeStore.addNode(project.currentNodeId, 0, 0, '甲')
    const id2 = nodeStore.addNode(project.currentNodeId, 50, 0, '乙')
    view.setSelectedNodes([id1, id2])

    const run = vi.fn()
    useUiRegistryStore().registerPluginContextMenuItem('demo', {
      id: 'hello-item',
      scope: 'selection',
      label: 'Hello 演示',
      run,
    })

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(mockContextMenuEvent())

    const items = contextMenu.items.value
    const pluginItem = items.find((it) => it.key === 'demo:hello-item')
    expect(pluginItem).toBeDefined()
    expect(pluginItem!.label).toBe('Hello 演示')
    // 插件项追加在内置项（含「发散」父项）之后
    expect(items[items.length - 1].key).toBe('demo:hello-item')

    pluginItem!.action!()
    expect(run).toHaveBeenCalledTimes(1)
    const ctx = run.mock.calls[0][0] as { selectedNodeIds: string[] }
    expect([...ctx.selectedNodeIds].sort()).toEqual([id1, id2].sort())
  })

  it('scope 过滤：canvas 项不出现在有选中分支', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const id = nodeStore.addNode(project.currentNodeId, 0, 0, '甲')
    view.selectNode(id)

    useUiRegistryStore().registerPluginContextMenuItem('demo', {
      id: 'canvas-only',
      scope: 'canvas',
      label: '仅空白画布',
      run: vi.fn(),
    })

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(mockContextMenuEvent())

    expect(contextMenu.items.value.find((it) => it.key === 'demo:canvas-only')).toBeUndefined()
  })

  it('无选中分支：canvas 项出现（即便剪贴板为空，仅插件项也打开菜单）', () => {
    // 剪贴板为空：内置项只有插件 canvas 项一条
    useUiRegistryStore().registerPluginContextMenuItem('demo', {
      id: 'canvas-only',
      scope: 'canvas',
      label: '仅空白画布',
      run: vi.fn(),
    })

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(mockContextMenuEvent())

    expect(contextMenu.visible.value).toBe(true)
    const items = contextMenu.items.value
    expect(items.length).toBe(1)
    expect(items[0].key).toBe('demo:canvas-only')
    expect(items[0].label).toBe('仅空白画布')
  })

  it('无选中分支：selection 项被过滤；when 返回 false 的项不出现', () => {
    useUiRegistryStore().registerPluginContextMenuItem('demo', {
      id: 'sel-only',
      scope: 'selection',
      label: '需要选中',
      run: vi.fn(),
    })
    useUiRegistryStore().registerPluginContextMenuItem('demo', {
      id: 'gated',
      scope: 'canvas',
      label: '被 when 拦下',
      when: () => false,
      run: vi.fn(),
    })

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(mockContextMenuEvent())

    const keys = contextMenu.items.value.map((it) => it.key)
    expect(keys).not.toContain('demo:sel-only')
    expect(keys).not.toContain('demo:gated')
  })

  it('when 收到选中节点 id（展开拷贝），返回 true 时项出现且 run 收到相同数组', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const id = nodeStore.addNode(project.currentNodeId, 0, 0, '甲')
    view.selectNode(id)

    const when = vi.fn(() => true)
    const run = vi.fn()
    useUiRegistryStore().registerPluginContextMenuItem('demo', {
      id: 'gated-on',
      scope: 'selection',
      label: '由 when 放行',
      when,
      run,
    })

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(mockContextMenuEvent())

    expect(when).toHaveBeenCalledWith({ selectedNodeIds: [id] })
    const item = contextMenu.items.value.find((it) => it.key === 'demo:gated-on')
    expect(item).toBeDefined()
    item!.action!()
    expect(run).toHaveBeenCalledWith({ selectedNodeIds: [id] })
  })

  it('danger / icon 字段透传到 ContextMenuItem', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const view = useViewStore('main')
    const id = nodeStore.addNode(project.currentNodeId, 0, 0, '甲')
    view.selectNode(id)

    const icon = { render: () => null } as unknown as import('vue').Component
    useUiRegistryStore().registerPluginContextMenuItem('demo', {
      id: 'dangerous',
      scope: 'selection',
      label: '危险操作',
      danger: true,
      icon,
      run: vi.fn(),
    })

    const { handleStageContextMenu, contextMenu } = useCanvasEvents('main')
    handleStageContextMenu(mockContextMenuEvent())

    const item = contextMenu.items.value.find((it) => it.key === 'demo:dangerous')
    expect(item).toBeDefined()
    expect(item!.danger).toBe(true)
    // reactive Map 深响应式会代理组件对象，断言存在性而非同一引用（与 ui-registry 测试同约定）
    expect(item!.icon).toBeTruthy()
  })
})
