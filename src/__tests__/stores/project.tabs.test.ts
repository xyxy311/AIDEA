import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useCommands } from '@/composables/useCommands'
import { serializeProject, parseProjectFile } from '@/utils/projectFile'
import { createNode } from '@/utils/factory'
import type { ProjectViewState } from '@/utils/projectFile'

describe('project store - 多标签页', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // 初始化项目：建立单一根标签并 doSwitch(ROOT)
    useProjectStore().resetForNewProject()
  })

  describe('addTab', () => {
    it('初始单一根标签，addTab 增到两个且 active 切到新标签', () => {
      const project = useProjectStore()
      expect(project.tabs.length).toBe(1)
      expect(project.activeTab?.viewedNodeId).toBe(ROOT_NODE_ID)
      const initialActive = project.activeTabId

      project.addTab()

      expect(project.tabs.length).toBe(2)
      expect(project.activeTabId).not.toBe(initialActive)
      expect(project.activeTab).toBeTruthy()
      expect(project.activeTab?.viewedNodeId).toBe(ROOT_NODE_ID)
      // 主视图与活动标签同步
      expect(project.currentNodeId).toBe(ROOT_NODE_ID)
    })
  })

  describe('switchView', () => {
    it('目标已被其它标签观察时跳转激活该标签而非新建', () => {
      const commands = useCommands()
      const project = useProjectStore()
      const a = commands.createNode(ROOT_NODE_ID, 0, 0, 'A')

      project.switchView(a) // tab0 views a
      const tab0Id = project.tabs[0].id
      project.addTab() // tab1 (root) 活动
      const beforeLen = project.tabs.length

      project.switchView(a)

      expect(project.activeTabId).toBe(tab0Id)
      expect(project.currentNodeId).toBe(a)
      expect(project.tabs.length).toBe(beforeLen) // 未新建标签
    })

    it('目标不存在时切当前活动标签的 viewedNodeId（沿用既有标签）', () => {
      const commands = useCommands()
      const project = useProjectStore()
      const a = commands.createNode(ROOT_NODE_ID, 0, 0, 'A')
      project.switchView(a) // 活动标签 views a
      const beforeLen = project.tabs.length

      project.switchView('ghost-id')

      expect(project.tabs.length).toBe(beforeLen)
      expect(project.activeTab?.viewedNodeId).toBe(a)
      expect(project.currentNodeId).toBe(a)
    })

    it('目标不存在时被忽略（switchView 对幽灵 id 不切标签）', () => {
      const project = useProjectStore()
      const cur = project.currentNodeId
      project.switchView('ghost-id')
      expect(project.currentNodeId).toBe(cur)
      expect(project.activeTab?.viewedNodeId).toBe(cur)
    })

    it('活动标签已观察该节点时 return（不重复切换）', () => {
      const commands = useCommands()
      const project = useProjectStore()
      const a = commands.createNode(ROOT_NODE_ID, 0, 0, 'A')
      project.switchView(a)
      const tab0Id = project.tabs[0].id
      project.switchView(a)
      expect(project.activeTabId).toBe(tab0Id)
      expect(project.currentNodeId).toBe(a)
    })
  })

  describe('closeTab', () => {
    it('关非活动标签不影响 active', () => {
      const commands = useCommands()
      const project = useProjectStore()
      const a = commands.createNode(ROOT_NODE_ID, 0, 0, 'A')
      project.switchView(a) // tab0 views a
      project.addTab() // tab1 root 活动
      const tab0Id = project.tabs[0].id

      project.closeTab(tab0Id)

      expect(project.tabs.length).toBe(1)
      expect(project.activeTabId).toBe(project.tabs[0].id)
      expect(project.currentNodeId).toBe(ROOT_NODE_ID)
    })

    it('关活动标签激活右侧邻居（中间标签）', () => {
      const commands = useCommands()
      const project = useProjectStore()
      const a = commands.createNode(ROOT_NODE_ID, 0, 0, 'A')
      project.switchView(a) // tab0 views a
      project.addTab() // tab1 root
      project.addTab() // tab2 root
      // 激活中间 tab1
      project.switchToTab(project.tabs[1].id)
      const tab1Id = project.tabs[1].id

      project.closeTab(tab1Id)

      expect(project.tabs.length).toBe(2)
      expect(project.activeTabId).toBe(project.tabs[1].id) // tab2 顶到 index1
      expect(project.currentNodeId).toBe(ROOT_NODE_ID)
    })

    it('关活动标签（末位）激活左侧邻居', () => {
      const commands = useCommands()
      const project = useProjectStore()
      const a = commands.createNode(ROOT_NODE_ID, 0, 0, 'A')
      project.switchView(a) // tab0 views a
      project.addTab() // tab1 root
      project.addTab() // tab2 root 活动
      const tab2Id = project.tabs[2].id

      project.closeTab(tab2Id)

      expect(project.tabs.length).toBe(2)
      expect(project.activeTabId).toBe(project.tabs[1].id) // 左侧邻居 tab1
      expect(project.currentNodeId).toBe(ROOT_NODE_ID)
    })

    it('仅剩一个标签时 closeTab 被忽略', () => {
      const project = useProjectStore()
      expect(project.tabs.length).toBe(1)
      const id = project.tabs[0].id
      project.closeTab(id)
      expect(project.tabs.length).toBe(1)
      expect(project.activeTabId).toBe(id)
    })
  })

  describe('moveTab', () => {
    it('纯数组重排标签顺序', () => {
      const project = useProjectStore()
      project.addTab() // tab0, tab1
      project.addTab() // tab0, tab1, tab2
      const original0 = project.tabs[0].id
      project.moveTab(0, 2)
      // 原 tab0 移到末位
      expect(project.tabs[2].id).toBe(original0)
      expect(project.moveTab(10, 0)).toBeUndefined() // 越界安全（不移动）
      expect(project.tabs.length).toBe(3)
    })
  })

  describe('switchToTab 懒检查', () => {
    it('目标 viewedNodeId 不存在 → 重置为 ROOT 且 tabFallbackNotice 为 true', () => {
      const project = useProjectStore()
      project.addTab() // tab0(root), tab1(root)，tab1 活动
      // 把 tab1 的 viewedNodeId 指向不存在的节点
      project.tabs[1].viewedNodeId = 'ghost'
      // 先切走（确保再切回时不因已是活动标签而早退）
      project.switchToTab(project.tabs[0].id)
      project.tabFallbackNotice = false

      project.switchToTab(project.tabs[1].id)

      expect(project.tabs[1].viewedNodeId).toBe(ROOT_NODE_ID)
      expect(project.tabFallbackNotice).toBe(true)
      expect(project.currentNodeId).toBe(ROOT_NODE_ID)
    })

    it('目标有效时懒检查不触发回退标志', () => {
      const commands = useCommands()
      const project = useProjectStore()
      const a = commands.createNode(ROOT_NODE_ID, 0, 0, 'A')
      project.addTab()
      // tab1 活动，指向 a
      project.tabs[1].viewedNodeId = a
      project.switchToTab(project.tabs[0].id)
      project.tabFallbackNotice = false

      project.switchToTab(project.tabs[1].id)

      expect(project.tabs[1].viewedNodeId).toBe(a)
      expect(project.tabFallbackNotice).toBe(false)
      expect(project.currentNodeId).toBe(a)
    })
  })

  describe('projectFile 往返', () => {
    it('tabs/activeTabId 序列化-解析一致，且裁剪失效项', () => {
      const nodes = [
        createNode({ id: ROOT_NODE_ID, parentId: null, text: '项目' }),
        createNode({ id: 'c1', parentId: ROOT_NODE_ID, text: '子' }),
        createNode({ id: 'c2', parentId: ROOT_NODE_ID, text: '孙' }),
      ]
      const viewState: ProjectViewState = {
        viewedNodeId: 'c1',
        stageX: 0,
        stageY: 0,
        stageScale: 1,
        expandedIds: [ROOT_NODE_ID],
        inlineViews: [],
        selectedNodeIds: [],
        selectedConnectionIds: [],
        tabs: [
          { id: 'tab1', viewedNodeId: ROOT_NODE_ID },
          { id: 'tab2', viewedNodeId: 'c1' },
          { id: 'tab3', viewedNodeId: 'ghost' }, // 失效 → 置 ROOT
          { id: '', viewedNodeId: 'c2' }, // 缺 id → generateId 补
        ],
        activeTabId: 'tab2',
      }

      const json = serializeProject(nodes, '项目', viewState, [], {})
      const parsed = parseProjectFile(json)

      expect(parsed.viewState.tabs).toBeDefined()
      expect(parsed.viewState.tabs!.length).toBe(4)
      expect(parsed.viewState.tabs!.map((t) => t.viewedNodeId)).toEqual([
        ROOT_NODE_ID,
        'c1',
        ROOT_NODE_ID,
        'c2',
      ])
      expect(parsed.viewState.tabs!.map((t) => t.id)).toContain('tab1')
      expect(parsed.viewState.tabs![2].id).toBe('tab3')
      expect(parsed.viewState.tabs![3].id).toBeTruthy()
      expect(parsed.viewState.tabs![3].id).not.toBe('')
      expect(parsed.viewState.activeTabId).toBe('tab2')
    })

    it('旧文件无 tabs 字段 → 解析后 tabs/activeTabId 缺省', () => {
      const nodes = [createNode({ id: ROOT_NODE_ID, parentId: null, text: 'x' })]
      const viewState: ProjectViewState = {
        viewedNodeId: ROOT_NODE_ID,
        stageX: 0,
        stageY: 0,
        stageScale: 1,
        expandedIds: [],
        inlineViews: [],
        selectedNodeIds: [],
        selectedConnectionIds: [],
      }
      const json = serializeProject(nodes, 'x', viewState, [], {})
      const parsed = parseProjectFile(json)
      expect(parsed.viewState.tabs).toBeUndefined()
      // activeTabId 为可空字段：无文件值时解析为 null
      expect(parsed.viewState.activeTabId).toBeNull()
    })
  })
})

// ========== 历史 (history) 协调与标签共存 ==========
describe('runWithViewCoord 与标签共存', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useProjectStore().resetForNewProject()
  })

  it('删除活动标签观察的节点后，祖先回退仍走 switchView 且标签承接', () => {
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const commands = useCommands()

    const childId = commands.createNode(ROOT_NODE_ID, 0, 0, '子')
    project.switchView(childId)
    expect(project.activeTab?.viewedNodeId).toBe(childId)

    commands.deleteNodes([childId])
    // 删除经命令层 runWithViewCoord 后回退到 root
    expect(nodeStore.getNode(childId)).toBeUndefined()
    expect(project.currentNodeId).toBe(ROOT_NODE_ID)
    expect(project.activeTab?.viewedNodeId).toBe(ROOT_NODE_ID)
  })
})