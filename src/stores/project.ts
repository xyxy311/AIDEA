import { ref, computed } from 'vue'
import { defineStore, getActivePinia } from 'pinia'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useNavigationStore } from '@/stores/navigation'
import { t } from '@/composables/useT'
import { generateId } from '@/utils/id'
import type { InlineViewItem } from '@/stores/view'

/** 内联视图状态快照（切走时保存） */
export interface InlineViewSnapshot {
  nodeId: string
  viewId: string
  width: number
  height: number
  stageX: number
  stageY: number
  stageScale: number
  selectedNodeIds: string[]
  selectedConnectionIds: string[]
  editingNodeId: string | null
  connectingFrom: string | null
}

/** 主视图某节点的状态快照 */
export interface ViewSnapshot {
  stageX: number
  stageY: number
  stageScale: number
  selectedNodeIds: string[]
  selectedConnectionIds: string[]
  editingNodeId: string | null
  connectingFrom: string | null
  inlineViews: InlineViewSnapshot[]
}

/** 项目标签页（多标签观察同一节点时共享其快照） */
export interface ProjectTab {
  id: string
  viewedNodeId: string
}

/**
 * 项目 Store —— 管理项目级导航：当前查看的节点（currentNodeId）、项目名（根节点 text 派生）、
 * 树展开态、视图快照、内联视图实例生命周期与多标签页。不存节点/连线数据（归 nodeStore），不存视口/选中（归 viewStore）。
 */
export const useProjectStore = defineStore('project', () => {
  const nodeStore = useNodeStore()
  /** 导航历史（记录当前查看节点，定长 10 条） */
  const navigation = useNavigationStore()

  // ── 确保主视图实例存在 ──
  useViewStore('main', { nodeId: ROOT_NODE_ID, type: 'main' })

  // ── 活跃视图 ──

  /** 主视图 ID 固定为 'main' */
  const activeViewId = ref<string>('main')

  /** 当前查看的节点 ID（从主视图 viewedNodeId 派生） */
  const currentNodeId = computed(() => useViewStore('main').viewedNodeId)

  /** 根视图 ID（项目节点，不可删除） */
  const rootViewId = computed(() => ROOT_NODE_ID)

  // ── 视图快照存储 ──

  /** 各节点的主视图状态快照（非响应式，仅用于保存/恢复） */
  const viewSnapshots = new Map<string, ViewSnapshot>()

  // ── 标签页 ──

  /** 标签页列表（多标签页，每个观察一个节点） */
  const tabs = ref<ProjectTab[]>([])

  /** 当前活动标签页 ID（null 表示无活动标签，仅在加载/重置的过渡态） */
  const activeTabId = ref<string | null>(null)

  /** 当前活动标签页（computed） */
  const activeTab = computed<ProjectTab | null>(
    () => tabs.value.find((t) => t.id === activeTabId.value) ?? null,
  )

  /** 标签懒检查回退标志：某标签 viewedNodeId 失效被重置为 ROOT 时置 true（UI 层提示用） */
  const tabFallbackNotice = ref(false)

  // 启动即保证至少一个根标签（刷新/首次加载的默认项目不经过 resetForNewProject）。
  // 主视图 viewedNodeId 初始即为 ROOT（useViewStore init），与此标签已同步，无需 doSwitch。
  if (tabs.value.length === 0) {
    const initialId = generateId()
    tabs.value = [{ id: initialId, viewedNodeId: ROOT_NODE_ID }]
    activeTabId.value = initialId
  }

  // ── 项目名（根节点 text 单一数据源）──

  /** 项目名 = 根节点 text（无根节点时回退文案经 t() 取当前语言资源） */
  const projectName = computed(() => nodeStore.rootNode?.text ?? t('common.untitledProject'))

  /** 设置项目名 = 修改根节点 text */
  function setProjectName(name: string): void {
    nodeStore.setNodeText(ROOT_NODE_ID, name)
  }

  // ── 树展开状态（全局导航态）──

  /** 展开的节点 ID 集合（根节点默认展开） */
  const expandedIds = ref<Set<string>>(new Set([ROOT_NODE_ID]))

  /** 切换展开 / 收起 */
  function toggleExpand(id: string): void {
    const next = new Set(expandedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedIds.value = next
  }

  /** 展开（不切换收起） */
  function expand(id: string): void {
    if (expandedIds.value.has(id)) return
    const next = new Set(expandedIds.value)
    next.add(id)
    expandedIds.value = next
  }

  // ── 快照保存/恢复（私有）──

  /** 保存当前主视图状态为指定节点的快照 */
  function saveSnapshot(nodeId: string): void {
    const view = useViewStore('main')
    // 先结束编辑
    view.stopEditing()
    view.stopEditingConnection()
    // 收集内联视图快照
    const inlineSnapshots: InlineViewSnapshot[] = view.inlineViews.map((iv: InlineViewItem) => {
      const ivView = useViewStore(iv.viewId)
      return {
        nodeId: iv.nodeId,
        viewId: iv.viewId,
        width: iv.width,
        height: iv.height,
        stageX: ivView.stageX,
        stageY: ivView.stageY,
        stageScale: ivView.stageScale,
        selectedNodeIds: Array.from(ivView.selectedNodeIds),
        selectedConnectionIds: Array.from(ivView.selectedConnectionIds),
        editingNodeId: ivView.editingNodeId,
        connectingFrom: ivView.connectingFrom,
      }
    })
    viewSnapshots.set(nodeId, {
      stageX: view.stageX,
      stageY: view.stageY,
      stageScale: view.stageScale,
      selectedNodeIds: Array.from(view.selectedNodeIds),
      selectedConnectionIds: Array.from(view.selectedConnectionIds),
      editingNodeId: view.editingNodeId,
      connectingFrom: view.connectingFrom,
      inlineViews: inlineSnapshots,
    })
  }

  /** 从快照恢复主视图状态到指定节点 */
  function restoreSnapshot(nodeId: string): void {
    const view = useViewStore('main')
    const snap = viewSnapshots.get(nodeId)
    if (!snap) {
      // 无快照：重置视图状态，视口归零
      view.resetViewState()
      view.stageX = 0
      view.stageY = 0
      view.stageScale = 1
      view.inlineViews = []
      return
    }
    // 恢复主视图状态
    view.stageX = snap.stageX
    view.stageY = snap.stageY
    view.stageScale = snap.stageScale
    view.selectedNodeIds = new Set(snap.selectedNodeIds)
    view.selectedConnectionIds = new Set(snap.selectedConnectionIds)
    view.editingNodeId = snap.editingNodeId
    view.connectingFrom = snap.connectingFrom
    // 重建内联视图
    view.inlineViews = []
    for (const ivSnap of snap.inlineViews) {
      const ivView = useViewStore(ivSnap.viewId, {
        nodeId: ivSnap.nodeId,
        type: 'inline',
        hostViewId: 'main',
      })
      ivView.stageX = ivSnap.stageX
      ivView.stageY = ivSnap.stageY
      ivView.stageScale = ivSnap.stageScale
      // 选中状态由主视图统一持有（内联视图通过 computed 共享主视图选中），不单独恢复
      ivView.editingNodeId = ivSnap.editingNodeId
      ivView.connectingFrom = ivSnap.connectingFrom
      view.addInlineView(ivSnap.nodeId, ivSnap.viewId, ivSnap.width, ivSnap.height)
    }
  }

  // ── 视图切换 ──

  /**
   * 私有：切换主视图到指定节点。
   * 保存当前节点快照 → 销毁主视图内联视图实例 → 改 viewedNodeId → 恢复目标快照。
   * recordHistory=true 时记录到导航历史（历史前进/后退应传 false，避免自己入栈自己）。
   * 调用方负责维护「当前活动标签 viewedNodeId 与 main.viewedNodeId 同步」。
   */
  function doSwitch(nodeId: string, recordHistory = true): void {
    const view = useViewStore('main')
    // 保存当前快照
    saveSnapshot(view.viewedNodeId)
    // 销毁当前内联视图实例
    for (const iv of [...view.inlineViews]) {
      destroyView(iv.viewId)
    }
    view.inlineViews = []
    // 切换目标节点
    view.viewedNodeId = nodeId
    // 记录导航历史（切换后 record 的节点即新位置）
    if (recordHistory) navigation.record(nodeId)
    // 恢复目标快照
    restoreSnapshot(nodeId)
  }

  /**
   * 切换到指定标签页。
   * 若 activeTabId 已是该标签直接 return；
   * 懒检查：目标 viewedNodeId 不存在则置为 ROOT 并置 tabFallbackNotice=true；
   * 最后 doSwitch 到该标签 viewedNodeId（recordHistory 透传给 doSwitch）。
   */
  function switchToTab(tabId: string, recordHistory = true): void {
    if (activeTabId.value === tabId) return
    const tab = tabs.value.find((t) => t.id === tabId)
    if (!tab) return
    // 懒检查：无效 viewedNodeId 重置为 ROOT
    let nodeId = tab.viewedNodeId
    if (!nodeStore.nodes.has(nodeId)) {
      tab.viewedNodeId = ROOT_NODE_ID
      nodeId = ROOT_NODE_ID
      tabFallbackNotice.value = true
    }
    activeTabId.value = tabId
    doSwitch(nodeId, recordHistory)
  }

  /**
   * 主视图切换到指定节点并确保标签状态同步（所有入口共用此语义）：
   * - 节点不存在 → false；
   * - 活动标签已观察此节点 → 无需切换，true；
   * - 存在其它标签观察此节点 → switchToTab 到该标签；
   * - 否则：设当前活动标签 viewedNodeId=nodeId 并 doSwitch（活动标签不变）。
   * recordHistory=false 用于导航历史前进/后退，避免自己入栈自己。
   */
  function ensureViewSynced(id: string, recordHistory: boolean): boolean {
    if (!nodeStore.nodes.has(id)) return false
    if (activeTab.value?.viewedNodeId === id) return true
    const observing = tabs.value.find((t) => t.viewedNodeId === id)
    if (observing) {
      switchToTab(observing.id, recordHistory)
      return true
    }
    if (activeTab.value) {
      activeTab.value.viewedNodeId = id
    }
    doSwitch(id, recordHistory)
    return true
  }

  /**
   * 切换主视图到指定节点：负责「考虑有无标签正好展示此视图」并同步标签状态。
   */
  function switchView(id: string): void {
    ensureViewSynced(id, true)
  }

  /** 新增一个标签页（观察根节点）并切到它 */
  function addTab(): void {
    const tabId = generateId()
    tabs.value.push({ id: tabId, viewedNodeId: ROOT_NODE_ID })
    switchToTab(tabId)
  }

  /**
   * 关闭标签页。
   * 仅剩一个时忽略；若关的是活动标签 → 激活右侧邻居（无则左侧）。
   */
  function closeTab(tabId: string): void {
    if (tabs.value.length <= 1) return
    const index = tabs.value.findIndex((t) => t.id === tabId)
    if (index === -1) return
    const wasActive = activeTabId.value === tabId
    tabs.value.splice(index, 1)
    if (wasActive && tabs.value.length > 0) {
      const neighbor = tabs.value[index] ?? tabs.value[index - 1]
      switchToTab(neighbor.id)
    }
  }

  /** 纯数组重排标签页顺序 */
  function moveTab(from: number, to: number): void {
    if (from === to) return
    if (from < 0 || from >= tabs.value.length) return
    if (to < 0 || to >= tabs.value.length) return
    const [tab] = tabs.value.splice(from, 1)
    tabs.value.splice(to, 0, tab)
  }

  /** 进入节点子视图（语义同 switchView，保留此方法供调用） */
  function enterNodeView(nodeId: string): void {
    switchView(nodeId)
  }

  // ── 导航历史前进/后退 ──

  /** 跳到导航历史中的上一位置（跳过已删除节点），经 ensureViewSynced 同步标签且不再入栈 */
  function navigateBack(): void {
    let target = navigation.back()
    while (target !== null && !nodeStore.nodes.has(target)) target = navigation.back()
    if (target !== null) ensureViewSynced(target, false)
  }

  /** 跳到导航历史中的下一位置（跳过已删除节点），经 ensureViewSynced 同步标签且不再入栈 */
  function navigateForward(): void {
    let target = navigation.forward()
    while (target !== null && !nodeStore.nodes.has(target)) target = navigation.forward()
    if (target !== null) ensureViewSynced(target, false)
  }

  // ── viewStore 实例销毁 ──

  /**
   * 销毁指定 viewId 对应的 viewStore 实例（从 Pinia 内部 Map 中删除）。
   * 主视图实例 viewId='main' 常驻，永不销毁；只销毁内联视图实例。
   */
  function destroyView(viewId: string): void {
    console.log('destroyView: ', viewId)
    if (viewId === 'main') return
    const pinia = getActivePinia()
    if (pinia) {
      ;((pinia as unknown) as { _s: Map<string, unknown> })._s.delete(`view-${viewId}`)
    }
  }

  /** 批量销毁 viewStore 实例 */
  function destroyViews(viewIds: string[]): void {
    for (const id of viewIds) destroyView(id)
  }

  /**
   * 清理 expandedIds 中已不存在的节点。
   * 供 history store 在 undo/redo 后调用。
   */
  function pruneExpanded(existingIds: Set<string>): void {
    let changed = false
    const next = new Set<string>()
    for (const id of expandedIds.value) {
      if (existingIds.has(id)) {
        next.add(id)
      } else {
        changed = true
      }
    }
    if (changed) {
      expandedIds.value = next
    }
  }

  /**
   * 重置标签页与主视图（新建 / 打开项目 / 加载时调用）。
   * 清空标签、活动标签、视图快照；新建单标签（观察 ROOT）并 activate + doSwitch(ROOT)。
   */
  function resetTabsForProject(): void {
    tabs.value = []
    activeTabId.value = null
    viewSnapshots.clear()
    // 新建单根标签并激活
    const tabId = generateId()
    tabs.value.push({ id: tabId, viewedNodeId: ROOT_NODE_ID })
    activeTabId.value = tabId
    tabFallbackNotice.value = false
    doSwitch(ROOT_NODE_ID)
  }

  /**
   * 重置为新项目（新建 / 打开项目时调用）。
   * 清空展开态、标签页与主视图状态，销毁所有内联视图实例，重置主视图（视口归零、清选中）。
   * AI 项目级配置归 ai 插件的 additions 数据管理（不由本 store 清理）。
   */
  function resetForNewProject(): void {
    expandedIds.value = new Set([ROOT_NODE_ID])
    // 重置标签页与主视图（清空快照、销毁内联实例、归位根节点）
    resetTabsForProject()
    // 重置导航历史：清空后以 ROOT 为起点（新项目 / 新会话的导航基准）
    navigation.clear()
    navigation.record(ROOT_NODE_ID)
  }

  return {
    // 活跃视图
    activeViewId,
    currentNodeId,
    rootViewId,
    // 项目名
    projectName,
    setProjectName,
    // 树展开
    expandedIds,
    toggleExpand,
    expand,
    // 视图切换
    switchView,
    enterNodeView,
    // 导航历史
    navigateBack,
    navigateForward,
    // 标签页
    tabs,
    activeTabId,
    activeTab,
    tabFallbackNotice,
    switchToTab,
    addTab,
    closeTab,
    moveTab,
    resetTabsForProject,
    // 项目级重置
    resetForNewProject,
    // viewStore 生命周期
    destroyView,
    destroyViews,
    pruneExpanded,
  }
})
