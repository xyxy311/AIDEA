/**
 * api/project.ts —— 项目域：历史控制 + 批量 + 项目统计 + 项目信息 + 树展开 + 标签页 + 视图导航 + 项目级操作
 * 本文件方法均为项目级 / 视图态操作（不经命令层，不带 user）；读取返回结构化快照（非响应式引用）。
 */
import type { ProjectStats } from '@/types/plugin'
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useFileStore } from '@/stores/file'
import { useCommands } from '@/composables/useCommands'
import { walkTree, mainView } from './shared'

/** 标签页快照（纯数据，非响应式） */
export interface ProjectTabInfo {
  id: string
  viewedNodeId: string
}

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
    stats(): ProjectStats {
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

    // ── 项目信息 ──

    /** 读取项目名（根节点 text 单一数据源） */
    projectName(): string {
      return useProjectStore().projectName
    },
    /** 设置项目名（项目级写，不经命令层，不带 user） */
    setProjectName(name: string): void {
      useProjectStore().setProjectName(name)
    },

    // ── 树展开（项目级导航态，非命令操作）──

    /** 读取当前展开的节点 ID 集合（数组快照） */
    expandedIds(): string[] {
      return Array.from(useProjectStore().expandedIds)
    },
    /** 切换指定节点展开 / 收起 */
    toggleExpand(nodeId: string): void {
      useProjectStore().toggleExpand(nodeId)
    },
    /** 展开指定节点（不切换收起） */
    expand(nodeId: string): void {
      useProjectStore().expand(nodeId)
    },

    // ── 标签页（项目级导航态，非命令操作）──

    /** 读取标签页列表（结构化快照） */
    tabs(): ProjectTabInfo[] {
      return useProjectStore().tabs.map((t) => ({ id: t.id, viewedNodeId: t.viewedNodeId }))
    },
    /** 切换到指定标签页 */
    switchToTab(tabId: string): void {
      useProjectStore().switchToTab(tabId)
    },
    /** 新增一个标签页（观察根节点）并切到它 */
    addTab(): void {
      useProjectStore().addTab()
    },
    /** 关闭指定标签页 */
    closeTab(tabId: string): void {
      useProjectStore().closeTab(tabId)
    },

    // ── 视图导航 ──

    /**
     * 进入选中节点的子级视图（切换主视图到当前选中节点）。
     * 无选中节点时不做任何事。纯视图操作，不入历史栈。
     */
    enterNodeView(): void {
      const nodeId = mainView().selectedNodeId
      if (!nodeId) return
      useProjectStore().switchView(nodeId)
    },

    // ── 项目级操作 ──

    /** 重置为新项目（清空展开态、标签页、AI 配置与主视图状态） */
    resetForNewProject(): void {
      useProjectStore().resetForNewProject()
    },
    /** 标记当前项目已修改（未保存改动，委托 file store） */
    markDirty(): void {
      useFileStore().markDirty()
    },
  }
  return api
}

export type ProjectApi = ReturnType<typeof createProjectApi>