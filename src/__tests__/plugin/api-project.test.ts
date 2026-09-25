import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createPluginAdapter } from '@/plugin/adapter'
import { useProjectStore } from '@/stores/project'
import { useFileStore } from '@/stores/file'
import { ROOT_NODE_ID } from '@/stores/node'

/** project 域 api 测试：项目信息 / 树展开 / 标签页 / 视图导航 / 项目级操作（均不经命令层）。 */
function makeApi() {
  return createPluginAdapter().api
}

describe('project 域扩展 api', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('projectName 读取默认值并写入改变 store', () => {
    const api = makeApi()
    expect(api.project.projectName()).toBe('未命名项目')
    api.project.setProjectName('我的新项目')
    expect(api.project.projectName()).toBe('我的新项目')
    // 确认 store 单一数据源（根节点 text）已同步
    expect(useProjectStore().projectName).toBe('我的新项目')
  })

  it('expandedIds 默认含根；toggleExpand / expand 改变集合', () => {
    const api = makeApi()
    expect(api.project.expandedIds()).toEqual([ROOT_NODE_ID])

    // toggleExpand 默认根展开 -> 收起（移出集合）
    api.project.toggleExpand(ROOT_NODE_ID)
    expect(api.project.expandedIds()).toEqual([])

    // expand 将根重新加回
    api.project.expand(ROOT_NODE_ID)
    expect(api.project.expandedIds()).toEqual([ROOT_NODE_ID])

    // expand 对已展开节点是幂等的
    api.project.expand(ROOT_NODE_ID)
    expect(api.project.expandedIds()).toEqual([ROOT_NODE_ID])

    // 对任意节点切换
    const id = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    api.project.toggleExpand(id)
    expect(api.project.expandedIds()).toContain(id)
  })

  it('tabs 读回；addTab / closeTab / switchToTab 改变标签页', () => {
    const api = makeApi()
    expect(api.project.tabs()).toHaveLength(1)
    const first = api.project.tabs()[0]
    expect(first.viewedNodeId).toBe(ROOT_NODE_ID)

    // 新增一个标签页（观察根节点）并切到它
    api.project.addTab()
    const tabs = api.project.tabs()
    expect(tabs).toHaveLength(2)
    const secondTab = tabs[1]
    expect(secondTab.viewedNodeId).toBe(ROOT_NODE_ID)

    // 切回第一个标签
    api.project.switchToTab(first.id)
    // 当前活动标签是第一个
    const store = useProjectStore()
    expect(store.activeTabId).toBe(first.id)

    // 关闭第二个标签
    api.project.closeTab(secondTab.id)
    expect(api.project.tabs()).toHaveLength(1)
    expect(api.project.tabs()[0].id).toBe(first.id)
  })

  it('enterNodeView 切到当前选中节点的子级视图', () => {
    const api = makeApi()
    const id = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    api.view.select(id)
    expect(api.view.active().viewedNodeId).toBe(ROOT_NODE_ID)
    api.project.enterNodeView()
    expect(api.view.active().viewedNodeId).toBe(id)
  })

  it('resetForNewProject 重置展开态与标签页', () => {
    const api = makeApi()
    const id = api.node.create(ROOT_NODE_ID, 0, 0, 'A')
    api.project.toggleExpand(id)
    api.project.addTab()
    expect(api.project.tabs()).toHaveLength(2)
    expect(api.project.expandedIds()).toContain(id)

    api.project.resetForNewProject()
    expect(api.project.expandedIds()).toEqual([ROOT_NODE_ID])
    expect(api.project.tabs()).toHaveLength(1)
    expect(api.project.tabs()[0].viewedNodeId).toBe(ROOT_NODE_ID)
  })

  it('markDirty 将 file store 标记为未保存', () => {
    const api = makeApi()
    expect(useFileStore().dirty).toBe(false)
    api.project.markDirty()
    expect(useFileStore().dirty).toBe(true)
  })
})