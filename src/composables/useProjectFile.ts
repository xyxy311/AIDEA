import { computed } from 'vue'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useProjectStore, type ProjectTab } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'
import { useViewStore } from '@/stores/view'
import { useFileStore } from '@/stores/file'
import { useRecentFilesStore } from '@/stores/recentFiles'
import { useTagsStore } from '@/stores/tags'
import { useAdditionsStore } from '@/stores/additions'
import { usePresetsStore } from '@/stores/presets'
import { useCommands } from '@/composables/useCommands'
import { deepClone, type NodeChange } from '@/utils/command'
import { nativeFile } from '@/composables/useNativeFile'
import { nativeFs } from '@/composables/useNativeFs'
import { useMessage } from 'naive-ui'
import { t } from '@/composables/useT'
import {
  serializeProject,
  parseProjectFile,
  type ProjectViewState,
} from '@/utils/projectFile'
import { buildTextOutline, layoutTextNodes, parseTextForest } from '@/utils/textOutline'
import type { PlacedTextNode } from '@/utils/textOutline'
import { createNode } from '@/utils/factory'
import { generateId } from '@/utils/id'
import { DEFAULT_NODE_WIDTH } from '@/constants'
import type { WhiteboardNode, Tag } from '@/types'

/**
 * useProjectFile - 项目文件编排：新建 / 保存 / 打开 / 最近文件 / 导出为文本 / 从文本插入。
 * 核心为 collectViewState（收集主视图状态）与 loadProjectIntoApp（载入数据）；
 * 文件选择与读写经 aideaFile / aideaFs 桥由 main 进程完成，本层负责分支与提示。
 */

/** 确认回调：返回 true 表示确认放弃，false 表示取消 */
export type ProjectConfirmFn = (message: string) => Promise<boolean>

/** 从文本插入的节点与现有节点包围盒之间的固定间距 */
const TEXT_INSERT_MARGIN = 80

/** useProjectFile 返回的 API 类型 */
export type ProjectFileApi = ReturnType<typeof useProjectFile>

export function useProjectFile(options?: { confirm?: ProjectConfirmFn }) {
  const nodeStore = useNodeStore()
  const project = useProjectStore()
  const history = useHistoryStore()
  const commands = useCommands()
  const fileStore = useFileStore()
  const recentFilesStore = useRecentFilesStore()
  const tagsStore = useTagsStore()
  const additionsStore = useAdditionsStore()
  const presets = usePresetsStore()

  /**
   * 最近打开文件（响应式 Ref）。
   * Pinia setup store 返回的 list 会被解包成数组；若直接暴露该数组，
   * 普通对象字段会固定旧引用，store 替换数组时菜单无法感知（bug 根因），
   * 故经 computed 二次包装，保证每次读取都追踪 store 的最新数组。
   */
  const recentFiles = computed(() => recentFilesStore.list)
  const message = useMessage()

  const confirm = options?.confirm

  /** 确认是否放弃未保存改动；无改动或已确认放弃返回 true */
  async function confirmDiscard(): Promise<boolean> {
    if (!fileStore.dirty) return true
    if (!confirm) {
      message.warning(t('menuBar.unsavedConfirmNeeded'))
      return false
    }
    return await confirm(t('menuBar.unsavedConfirm'))
  }

  /** 收集主视图状态为可持久化 viewState */
  function collectViewState(): ProjectViewState {
    const view = useViewStore('main')
    return {
      viewedNodeId: view.viewedNodeId,
      stageX: view.stageX,
      stageY: view.stageY,
      stageScale: view.stageScale,
      expandedIds: Array.from(project.expandedIds),
      inlineViews: view.inlineViews.map((iv) => ({
        nodeId: iv.nodeId,
        width: iv.width,
        height: iv.height,
      })),
      selectedNodeIds: Array.from(view.selectedNodeIds),
      selectedConnectionIds: Array.from(view.selectedConnectionIds),
      // 标签页（映射 id + viewedNodeId）与活动标签 ID
      tabs: project.tabs.map((t) => ({ id: t.id, viewedNodeId: t.viewedNodeId })),
      activeTabId: project.activeTabId,
    }
  }

  /** 将项目数据载入应用（新建 / 打开共用） */
  function loadProjectIntoApp(data: {
    projectName: string
    nodes: WhiteboardNode[]
    tags?: Tag[]
    viewState: ProjectViewState
    additions?: Record<string, unknown>
  }): void {
    // 0. 载入插件项目化扩展数据（逐一过滤 `pluginId:` 前缀，仅保留合法键）
    additionsStore.load(data.additions)

    // 1. 整树替换，确保根节点存在
    const map = new Map<string, WhiteboardNode>()
    for (const n of data.nodes) map.set(n.id, n)
    if (!map.has(ROOT_NODE_ID)) {
      map.set(
        ROOT_NODE_ID,
        createNode({ id: ROOT_NODE_ID, parentId: null, text: data.projectName }),
      )
    }
    nodeStore.replaceNodes(map)

    // 1.5 替换标签定义（打开项目时恢复；新建时 data.tags 为空数组）
    tagsStore.replaceTags(data.tags ?? [])

    // 2. 清空撤销栈（整树替换不可撤销）
    commands.clearHistory()

    // 3. 重置项目级与主视图状态（不含历史，不触发 dirty）
    project.resetForNewProject()

    const existingIds = new Set(map.keys())

    // 4. 恢复展开态（与现有节点交集，根节点必展开）
    const expanded = new Set<string>()
    for (const id of data.viewState.expandedIds) {
      if (existingIds.has(id)) expanded.add(id)
    }
    if (!expanded.has(ROOT_NODE_ID)) expanded.add(ROOT_NODE_ID)
    project.expandedIds = expanded

    // 5. 按 viewState 重建标签列表并切换活动标签视图
    //    resetForNewProject（内调 resetTabsForProject）已建立单根标签并 doSwitch(ROOT)，
    //    此处基于文件中的 tabs 重建：失效 viewedNodeId 置 ROOT；缺 id 用 generateId 补。
    let viewTabs = data.viewState.tabs
    let tabs: ProjectTab[]
    if (viewTabs && viewTabs.length > 0) {
      tabs = viewTabs.map((tb) => ({
        id: tb.id ?? generateId(),
        viewedNodeId:
          tb.viewedNodeId && existingIds.has(tb.viewedNodeId)
            ? tb.viewedNodeId
            : ROOT_NODE_ID,
      }))
    } else {
      // 旧文件（无 tabs）向后兼容：以单视图 viewedNodeId 作为唯一标签的观察节点
      const legacyNode =
        data.viewState.viewedNodeId && existingIds.has(data.viewState.viewedNodeId)
          ? data.viewState.viewedNodeId
          : ROOT_NODE_ID
      tabs = [{ id: generateId(), viewedNodeId: legacyNode }]
    }
    project.tabs = tabs

    // 选择活动标签：activeTabId 命中则激活，否则激活第一个
    let activeId = tabs[0].id
    if (data.viewState.activeTabId && tabs.some((t) => t.id === data.viewState.activeTabId)) {
      activeId = data.viewState.activeTabId
    }
    // 临时清空 activeTabId，确保 switchToTab 不因「已是该标签」而早退，触发 doSwitch
    project.activeTabId = null
    project.switchToTab(activeId)

    const view = useViewStore('main')

    // 6. 恢复视口（需在 switchView 之后，避免被 restoreSnapshot 重置）
    view.setViewport(data.viewState.stageX, data.viewState.stageY, data.viewState.stageScale)

    // 7. 重建内联视图（对仍存在的 nodeId 创建实例 + addInlineView）
    for (const iv of data.viewState.inlineViews) {
      if (!existingIds.has(iv.nodeId)) continue
      const viewId = generateId()
      const ivView = useViewStore(viewId, {
        nodeId: iv.nodeId,
        type: 'inline',
        hostViewId: 'main',
      })
      ivView.stageX = 0
      ivView.stageY = 0
      ivView.stageScale = 1
      view.addInlineView(iv.nodeId, viewId, iv.width, iv.height)
    }

    // 8. 恢复选中（剔除不存在的节点 / 连线）
    const validConnIds = new Set<string>()
    for (const n of map.values()) {
      for (const c of n.connections) validConnIds.add(c.id)
    }
    const selNodes = new Set(
      data.viewState.selectedNodeIds.filter((id) => existingIds.has(id)),
    )
    const selConns = new Set(
      data.viewState.selectedConnectionIds.filter((id) => validConnIds.has(id)),
    )
    view.selectedNodeIds = selNodes
    view.selectedConnectionIds = selConns
  }

  /** 序列化当前项目为 JSON 字符串 */
  function buildProjectJson(): string {
    const nodes = Array.from(nodeStore.nodes.values())
    const projectName = nodeStore.rootNode?.text || t('common.untitledProject')
    const viewState = collectViewState()
    const tags = tagsStore.tagList
    return serializeProject(nodes, projectName, viewState, tags, additionsStore.serialize())
  }

  /** 默认保存文件名（项目名 + '.aidea.json'） */
  function defaultFileName(): string {
    const name = nodeStore.rootNode?.text?.trim() || t('common.untitledProject')
    return `${name}.aidea.json`
  }

  /** 新建项目 */
  async function newProject(): Promise<void> {
    if (!(await confirmDiscard())) return
    const untitled = t('common.untitledProject')
    const root = createNode({ id: ROOT_NODE_ID, parentId: null, text: untitled })
    loadProjectIntoApp({
      projectName: untitled,
      nodes: [root],
      viewState: {
        viewedNodeId: ROOT_NODE_ID,
        stageX: 0,
        stageY: 0,
        stageScale: 1,
        expandedIds: [ROOT_NODE_ID],
        inlineViews: [],
        selectedNodeIds: [],
        selectedConnectionIds: [],
      },
    })
    fileStore.resetFileState()
    // 新建项目：清空插件项目化扩展数据
    additionsStore.clear()
    // 新窗口当前无项目路径，释放「已打开」登记位
    await nativeFile.setProjectPath(null)
    // 标签定义已由 loadProjectIntoApp 的 `tags ?? []` 兜底清空（无需重复 clearTags）
    message.success(t('menuBar.newProjectDone'))
  }

  /** 打开项目（main showOpenDialog + readFile） */
  async function openProject(): Promise<void> {
    if (!(await confirmDiscard())) return
    try {
      const res = await nativeFile.openProject()
      if (res.canceled || !res.content || !res.path) return // 用户取消不提示
      // 项目已在其它窗口打开 → main 已聚焦该窗口，此处拦截本次打开（不替换当前内容）
      const claim = await nativeFile.claimProject(res.path)
      if (claim.intercepted) {
        return
      }
      const data = parseProjectFile(res.content)
      loadProjectIntoApp(data)
      // 记住打开路径，后续保存直接覆盖该文件；仅清 dirty，不清路径
      fileStore.markClean()
      fileStore.setSavedPath(res.path)
      await nativeFile.setProjectPath(res.path)
      recentFilesStore.add(res.name ?? '', res.path)
      message.success(t('menuBar.opened'))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(t('menuBar.openFailed', { message: msg }))
    }
  }

  /** 打开最近文件（按持久化路径经桥重新读盘载入） */
  async function openRecentFile(name: string): Promise<void> {
    const entry = recentFilesStore.list.find((f) => f.name === name)
    if (!entry) return
    // 路径已知，先查重：已在其它窗口打开 → main 聚焦该窗口，拦截本次打开
    const claim = await nativeFile.claimProject(entry.path)
    if (claim.intercepted) {
      message.warning(t('menuBar.alreadyOpen'))
      return
    }
    if (!(await confirmDiscard())) return
    try {
      const { content } = await nativeFile.readFile({ path: entry.path })
      const data = parseProjectFile(content)
      loadProjectIntoApp(data)
      // 最近文件可经持久化路径直接覆盖保存：记录路径，清 dirty
      fileStore.markClean()
      fileStore.setSavedPath(entry.path)
      await nativeFile.setProjectPath(entry.path)
      // 刷新为最近（置顶 + 更新时间）
      recentFilesStore.add(entry.name, entry.path)
      message.success(t('menuBar.opened'))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(t('menuBar.openFailed', { message: msg }))
    }
  }

  /** 保存项目（Ctrl+S 与菜单保存共用） */
  async function saveProject(): Promise<void> {
    const json = buildProjectJson()
    fileStore.suggestedName = defaultFileName()
    const path = fileStore.getSavedPath()
    if (path) {
      try {
        await nativeFile.writeFile({ path, content: json })
        fileStore.markClean()
        message.success(t('menuBar.saved'))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        message.error(t('menuBar.saveFailed', { message: msg }))
      }
      return
    }
    // 无记忆路径：走另存为逻辑
    await saveAsProject()
  }

  /** 导出为文本：深度优先收集整棵节点树，制表符缩进排成大纲，经 fs 桥另存为 .txt */
  async function exportToText(): Promise<void> {
    const rootId = ROOT_NODE_ID
    const outline = buildTextOutline(rootId, {
      textOf: (id) => nodeStore.getNode(id)?.text,
      childrenOf: (id) => nodeStore.childrenOf(id).map((n) => n.id),
    })
    const name = nodeStore.rootNode?.text?.trim() || t('common.untitledProject')
    try {
      const res = await nativeFs.save({
        mode: 'text',
        title: t('menuBar.exportToText'),
        defaultName: `${name}.txt`,
        filters: [{ name: t('menuBar.exportToTextFilter'), extensions: ['txt'] }],
        content: outline,
      })
      if (res.canceled || !res.path) return
      message.success(t('menuBar.exportedToText'))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(t('menuBar.exportToTextFailed', { message: msg }))
    }
  }

  /** 从文本插入节点：解析缩进森林，作为当前视图观察节点的子树插入（预设样式，单条历史可撤销）。返回插入的节点数 */
  function insertNodeText(content: string): number {
    const forest = parseTextForest(content)
    if (forest.length === 0) return 0

    const parentId = project.currentNodeId
    // 默认样式：当前节点预设分组第一项；无则 undefined → 工厂回退到默认样式（同 useCommands.createNode）
    const borderColor = presets.defaultNodePreset?.borderColor
    // 先按层级排成整齐网格（每层列数 = floor(√层节点数)，间距固定）
    const placed = layoutTextNodes(forest)

    // 收集全部（含子树）以计算插入内容的包围盒
    const all: PlacedTextNode[] = []
    const collectAll = (nodes: PlacedTextNode[]): void => {
      for (const n of nodes) {
        all.push(n)
        collectAll(n.children)
      }
    }
    collectAll(placed)
    let insMaxX = 0
    for (const p of all) {
      insMaxX = Math.max(insMaxX, p.x + DEFAULT_NODE_WIDTH)
    }

    // 现有节点包围盒（当前视图直接子节点）；无则原点对齐
    let exMinY = 0
    let exMaxX = 0
    const existing = nodeStore.childrenOf(parentId)
    if (existing.length > 0) {
      exMinY = Infinity
      exMaxX = -Infinity
      for (const n of existing) {
        exMinY = Math.min(exMinY, n.y)
        exMaxX = Math.max(exMaxX, n.x + n.width)
      }
    }
    // 插入原点：整体放到现有包围盒的右侧之外，垂直与现有顶部平齐
    const originX = exMaxX + TEXT_INSERT_MARGIN
    const originY = exMinY

    const nodeChanges: NodeChange[] = []
    const build = (nodes: PlacedTextNode[], pid: string): void => {
      for (const p of nodes) {
        const id = generateId()
        const node = createNode({
          id,
          parentId: pid,
          text: p.text,
          borderColor,
          x: originX + p.x,
          y: originY + p.y,
        })
        nodeStore.nodes.set(id, node)
        nodeChanges.push({ type: 'add', id, new: deepClone(node) })
        build(p.children, id)
      }
    }
    build(placed, parentId)

    // 一次性入栈：整次插入 = 单条历史，可一步撤销/重做
    history.pushCommand({ nodeChanges, connChanges: [] })
    return nodeChanges.length
  }

  /** 另存为项目（main showSaveDialog + writeFile） */
  async function saveAsProject(): Promise<void> {
    const json = buildProjectJson()
    const name = defaultFileName()
    fileStore.suggestedName = name
    try {
      const res = await nativeFile.saveProject({ defaultName: name, content: json })
      if (res.canceled || !res.path) return // 用户取消不报错
      fileStore.setSavedPath(res.path)
      fileStore.markClean()
      await nativeFile.setProjectPath(res.path)
      recentFilesStore.add(res.name ?? '', res.path)
      message.success(t('menuBar.saved'))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(t('menuBar.saveFailed', { message: msg }))
    }
  }

  return {
    newProject,
    openProject,
    openRecentFile,
    saveProject,
    saveAsProject,
    exportToText,
    insertNodeText,
    recentFiles,
    dirty: fileStore.dirty,
    suggestedName: fileStore.suggestedName,
    // 统一未保存确认（干净直接过、脏则弹确认对话框）：
    // 供关闭窗口（WindowControls）等新消费方复用，避免各处重写 dirty 分支
    confirmDiscard,
  }
}