/**
 * api/node.ts —— 节点域：树查询 + 节点写
 * 接口类型由实现派生（`NodeApi = ReturnType<typeof createNodeApi>`），不再手写。
 */
import type { WhiteboardNode } from '@/types/node'
import type { TreeVisitInfo } from '@/types/plugin'
import { useNodeStore } from '@/stores/node'
import { useCommands } from '@/composables/useCommands'
import { walkTree } from './shared'

export function createNodeApi() {
  const api = {
    get(id: string): WhiteboardNode | null {
      return useNodeStore().getNode(id) ?? null
    },
    children(parentId: string): WhiteboardNode[] {
      return useNodeStore().childrenOf(parentId)
    },
    hasChildren(id: string): boolean {
      return useNodeStore().hasChildren(id)
    },
    descendants(id: string): string[] {
      return useNodeStore().descendantsOf(id)
    },
    pathToRoot(id: string): string[] {
      return useNodeStore().pathToRoot(id)
    },
    /** 从根节点先序(DFS)遍历整棵树 */
    tree(visit: (info: TreeVisitInfo) => void): void {
      walkTree(useNodeStore(), visit)
    },
    create(parentId: string, x: number, y: number, text?: string): string {
      return useCommands().createNode(parentId, x, y, text)
    },
    remove(ids: string[]): void {
      useCommands().deleteNodes(ids)
    },
    setText(nodeId: string, text: string): { ok: boolean; conflictRef?: string } {
      return useCommands().setNodeText(nodeId, text)
    },
    setTexts(ids: string[], text: string): { ok: boolean; conflictRef?: string } {
      return useCommands().setNodesText(ids, text)
    },
    setStyle(ids: string[], partial: { borderColor?: string }): void {
      useCommands().updateNodesStyle(ids, partial)
    },
    /** 应用节点预设样式（走可撤销写入） */
    applyPreset(nodeId: string, preset: { borderColor: string }): void {
      useCommands().updateNodesStyle([nodeId], { borderColor: preset.borderColor })
    },
    group(ids: string[]): string | null {
      return useCommands().groupNodes(ids)
    },
    clearChildren(parentId: string): void {
      useCommands().clearNodeChildren(parentId)
    },
  }
  return api
}

export type NodeApi = ReturnType<typeof createNodeApi>