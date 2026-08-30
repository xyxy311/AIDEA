/**
 * api/project.ts —— 项目域：历史控制 + 批量 + 项目统计
 * 接口类型由实现派生（`ProjectApi = ReturnType<typeof createProjectApi>`）。
 */
import { useNodeStore } from '@/stores/node'
import { useCommands } from '@/composables/useCommands'
import { walkTree } from './shared'

export function createProjectApi() {
  const api = {
    canUndo(): boolean {
      return useCommands().canUndo.value
    },
    canRedo(): boolean {
      return useCommands().canRedo.value
    },
    undo(): void {
      useCommands().undo()
    },
    redo(): void {
      useCommands().redo()
    },
    clearHistory(): void {
      useCommands().clearHistory()
    },
    /** 多步写合并为单条历史 */
    beginBatch(): void {
      useCommands().beginBatch()
    },
    commitBatch(): void {
      useCommands().commitBatch()
    },
    rollbackBatch(): void {
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
  return api
}

export type ProjectApi = ReturnType<typeof createProjectApi>