/**
 * api.ts —— 应用 api 的分类封装（node / connection / tag / stylePreset / project / view）
 *
 * 每一个方法都是对上层现有能力（nodeStore / viewStore / projectStore / tagsStore /
 * useCommands）的一行委托。方法在**调用时**才惰性取 store / composable，因此
 * `createPluginApi()` 可在任意时机创建，不依赖当时 pinia 是否就绪。
 *
 * - 只读方法返回快照，不引用内部 reactive；
 * - 写方法一律走 `useCommands`（主应用唯一写入口），自动并入历史栈（可撤销）；
 * - `project.beginBatch/commitBatch` 可把多步写合并为单条历史。
 */
import type {
  PluginApi,
  NodeApi,
  ConnectionApi,
  TagApi,
  StylePresetApi,
  ProjectApi,
  ViewApi,
  TreeVisitInfo,
} from '@/types'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useViewStore } from '@/stores/view'
import { useTagsStore } from '@/stores/tags'
import { useCommands } from '@/composables/useCommands'
import { extractReferenceName } from '@/utils/reference'

/** 主视图实例（常驻，承载选中/视口等视图状态） */
function mainView(): ReturnType<typeof useViewStore> {
  return useViewStore('main')
}

/** 从根节点先序(DFS)遍历整棵树，逐个回调 visit(info) */
function walkTree(
  nodeStore: ReturnType<typeof useNodeStore>,
  visit: (info: TreeVisitInfo) => void,
): void {
  const stack: Array<{ id: string; depth: number }> = [{ id: ROOT_NODE_ID, depth: 0 }]
  while (stack.length) {
    const { id, depth } = stack.pop()!
    const node = nodeStore.getNode(id)
    if (!node) continue
    visit({ node, depth, parentId: node.parentId })
    const children = nodeStore.childrenOf(id)
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ id: children[i].id, depth: depth + 1 })
    }
  }
}

/** 构造分类好的应用 api */
export function createPluginApi(): PluginApi {
  const node: NodeApi = {
    get(id) {
      return useNodeStore().getNode(id) ?? null
    },
    children(parentId) {
      return useNodeStore().childrenOf(parentId)
    },
    hasChildren(id) {
      return useNodeStore().hasChildren(id)
    },
    descendants(id) {
      return useNodeStore().descendantsOf(id)
    },
    pathToRoot(id) {
      return useNodeStore().pathToRoot(id)
    },
    tree(visit) {
      walkTree(useNodeStore(), visit)
    },
    create(parentId, x, y, text) {
      return useCommands().createNode(parentId, x, y, text)
    },
    remove(ids) {
      useCommands().deleteNodes(ids)
    },
    setText(nodeId, text) {
      return useCommands().setNodeText(nodeId, text)
    },
    setTexts(ids, text) {
      return useCommands().setNodesText(ids, text)
    },
    setStyle(ids, partial) {
      useCommands().updateNodesStyle(ids, partial)
    },
    applyPreset(nodeId, preset) {
      // 节点预设目前只改边框色：经 setStyle 走可撤销历史
      useCommands().updateNodesStyle([nodeId], { borderColor: preset.borderColor })
    },
    group(ids) {
      return useCommands().groupNodes(ids)
    },
    clearChildren(parentId) {
      useCommands().clearNodeChildren(parentId)
    },
  }

  const connection: ConnectionApi = {
    list(parentId) {
      return useNodeStore().getConnections(parentId)
    },
    find(connectionId) {
      return useNodeStore().findConnectionById(connectionId)
    },
    add(parentId, fromNodeId, toNodeId) {
      return useCommands().addConnection(parentId, fromNodeId, toNodeId)
    },
    remove(parentId, connIds) {
      useCommands().deleteConnections(parentId, connIds)
    },
    removeByIds(connIds) {
      useCommands().deleteConnectionsByIds(connIds)
    },
    update(parentId, connectionId, partial) {
      useCommands().updateConnection(parentId, connectionId, partial)
    },
    updateStyleByIds(connIds, partial) {
      useCommands().updateConnectionsStyleByIds(connIds, partial)
    },
    applyPreset(parentId, connectionId, preset) {
      useCommands().updateConnection(parentId, connectionId, {
        lineStyle: preset.lineStyle,
        strokeWidth: preset.strokeWidth,
        strokeColor: preset.strokeColor,
        directed: preset.directed,
      })
    },
  }

  const tag: TagApi = {
    list() {
      return useTagsStore().tagList
    },
    get(id) {
      return useTagsStore().getTag(id)
    },
  }

  // 预留：预设增删改（节点/连线预设数据层落地方可填充）
  const stylePreset: StylePresetApi = {}

  const project: ProjectApi = {
    canUndo() {
      return useCommands().canUndo.value
    },
    canRedo() {
      return useCommands().canRedo.value
    },
    undo() {
      useCommands().undo()
    },
    redo() {
      useCommands().redo()
    },
    clearHistory() {
      useCommands().clearHistory()
    },
    beginBatch() {
      useCommands().beginBatch()
    },
    commitBatch() {
      useCommands().commitBatch()
    },
    rollbackBatch() {
      useCommands().rollbackBatch()
    },
    stats() {
      const nodeStore = useNodeStore()
      let totalNodes = 0
      let maxDepth = 0
      const tagCounts: Record<string, number> = {}
      walkTree(nodeStore, ({ node, depth }) => {
        totalNodes++
        maxDepth = Math.max(maxDepth, depth)
        for (const tagId of node.tagIds ?? []) {
          tagCounts[tagId] = (tagCounts[tagId] ?? 0) + 1
        }
      })
      return {
        totalNodes: totalNodes - 1,
        maxDepth: Math.max(maxDepth - 1, 0),
        totalReferences: nodeStore.referenceableNodes().length,
        tagCounts,
      }
    },
  }

  const view: ViewApi = {
    active() {
      const nodeId = useProjectStore().currentNodeId
      return { viewedNodeId: nodeId, isMain: nodeId === ROOT_NODE_ID }
    },
    selection() {
      const v = mainView()
      return {
        nodeIds: Array.from(v.selectedNodeIds),
        connectionIds: Array.from(v.selectedConnectionIds),
      }
    },
    switch(nodeId) {
      useProjectStore().switchView(nodeId)
    },
    select(nodeId, ctrlKey = false) {
      mainView().selectNode(nodeId, ctrlKey)
    },
    clearSelection() {
      mainView().clearSelection()
    },
    stats() {
      const nodeStore = useNodeStore()
      const viewedNodeId = useProjectStore().currentNodeId
      const children = nodeStore.childrenOf(viewedNodeId)
      const directReferenceCount = children.filter((c) =>
        !!extractReferenceName(c.text)).length
      const totalWords = children.reduce((sum, c) => sum + (c.text?.length ?? 0), 0)
      return {
        viewedNodeId,
        childCount: children.length,
        connectionCount: nodeStore.getConnections(viewedNodeId).length,
        directReferenceCount,
        totalWords,
      }
    },
  }

  return { node, connection, tag, stylePreset, project, view }
}