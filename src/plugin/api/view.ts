/**
 * api/view.ts —— 视图域：活动视图 / 选中 / 视图切换 + 视图统计
 * 接口类型由实现派生（`ViewApi = ReturnType<typeof createViewApi>`）。
 */
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { extractReferenceName } from '@/utils/reference'
import { mainView } from './shared'

export function createViewApi() {
  const api = {
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
    switch(nodeId: string): void {
      useProjectStore().switchView(nodeId)
    },
    select(nodeId: string, ctrlKey = false): void {
      mainView().selectNode(nodeId, ctrlKey)
    },
    clearSelection(): void {
      mainView().clearSelection()
    },
    stats() {
      const nodeStore = useNodeStore()
      const viewedNodeId = useProjectStore().currentNodeId
      const children = nodeStore.childrenOf(viewedNodeId)
      const directReferenceCount = children.filter((c) => !!extractReferenceName(c.text)).length
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
  return api
}

export type ViewApi = ReturnType<typeof createViewApi>