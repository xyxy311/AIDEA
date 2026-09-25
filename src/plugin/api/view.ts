/**
 * api/view.ts —— 视图域：活动视图 / 选中 / 视图切换 + 视图统计。
 * 全为视图状态操作（不入历史、不带 user），直接委托 view store；返回结构化快照，不暴露 reactive 引用。
 */
import type { ActiveViewInfo, SelectionInfo, ViewStats } from '@/types/plugin'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useStageSize } from '@/composables/useStageSize'
import { extractReferenceName } from '@/utils/reference'
import { mainView } from './shared'

/** 内联视图项快照（视图状态，非 reactive 引用） */
export interface InlineViewSnapshot {
  /** 被展开的节点 ID */
  nodeId: string
  /** 矩形宽度（视图状态，不入 undo） */
  width: number
  /** 矩形高度（视图状态，不入 undo） */
  height: number
}

export function createViewApi() {
  const api = {
    // ── 活动视图 / 切换 ──
    active(): ActiveViewInfo {
      const nodeId = useProjectStore().currentNodeId
      return { viewedNodeId: nodeId, isMain: nodeId === ROOT_NODE_ID }
    },
    selection(): SelectionInfo {
      const v = mainView()
      return {
        nodeIds: Array.from(v.selectedNodeIds),
        connectionIds: Array.from(v.selectedConnectionIds),
      }
    },
    switch(nodeId: string): void {
      useProjectStore().switchView(nodeId)
    },

    // ── 选中 ──
    select(nodeId: string, ctrlKey = false): void {
      mainView().selectNode(nodeId, ctrlKey)
    },
    /** 选中 / 取消选中连线（ctrlKey=true 时 toggle）；连线与节点选择互斥 */
    selectConnection(connectionId: string, ctrlKey = false): void {
      mainView().selectConnection(connectionId, ctrlKey)
    },
    /** 批量设置选中节点（additive=true 追加而非替换，且清空连线选中） */
    setSelectedNodes(ids: string[], additive = false): void {
      mainView().setSelectedNodes(ids, additive)
    },
    /**
     * 清理选中集合中已不存在的节点 / 连线（数据删除或 undo / redo 后调用）。
     * store 的 pruneSelection 需传入有效集合，此处由 api 自动以 nodeStore 为准
     * 计算「仍有效的选中项」再委托，调用方无需感知内部签名。
     */
    pruneSelection(): void {
      const v = mainView()
      const nodeStore = useNodeStore()
      const validNodeIds = new Set(
        Array.from(v.selectedNodeIds).filter((id) => !!nodeStore.getNode(id)),
      )
      const validConnIds = new Set(
        Array.from(v.selectedConnectionIds).filter((id) => !!nodeStore.findConnectionById(id)),
      )
      v.pruneSelection(validNodeIds, validConnIds)
    },
    clearSelection(): void {
      mainView().clearSelection()
    },

    // ── 编辑态 ──
    /** 当前正在编辑文字的节点 ID（无编辑返回 null） */
    editingNodeId(): string | null {
      return mainView().editingNodeId
    },
    startEditing(nodeId: string): void {
      mainView().startEditing(nodeId)
    },
    stopEditing(): void {
      mainView().stopEditing()
    },

    // ── 视口（只读 getter + 设置）──
    /** 画布视口 X 偏移（世界坐标） */
    stageX(): number {
      return mainView().stageX
    },
    /** 画布视口 Y 偏移（世界坐标） */
    stageY(): number {
      return mainView().stageY
    },
    /** 画布缩放倍率 */
    stageScale(): number {
      return mainView().stageScale
    },
    /** 设置画布视口（平移 + 缩放）——视图状态，不入历史 */
    setViewport(x: number, y: number, scale: number): void {
      mainView().setViewport(x, y, scale)
    },
    /** 视口中心的世界坐标（左上角定位基准）：world = (screenCenter - offset) / scale */
    viewportCenterWorld(): { x: number; y: number } {
      // 与现有方法内 useStore 模式一致：惰性取画布实测尺寸（未注册容器时为窗口回退值）
      const { stageWidth, stageHeight } = useStageSize()
      const v = mainView()
      return {
        x: (stageWidth.value / 2 - v.stageX) / v.stageScale,
        y: (stageHeight.value / 2 - v.stageY) / v.stageScale,
      }
    },

    // ── 内联视图（状态仅主视图持有，统一走 mainView）──
    /** 全部内联视图项快照（nodeId + 矩形尺寸），空数组表示无展开 */
    inlineViews(): InlineViewSnapshot[] {
      return mainView().inlineViews.map((iv) => ({
        nodeId: iv.nodeId,
        width: iv.width,
        height: iv.height,
      }))
    },
    /** 添加内联视图项（已存在同 nodeId 则忽略）——视图状态，不入历史 */
    addInlineView(nodeId: string, viewId: string, width: number, height: number): void {
      mainView().addInlineView(nodeId, viewId, width, height)
    },
    /** 移除内联视图项 */
    removeInlineView(nodeId: string): void {
      mainView().removeInlineView(nodeId)
    },
    /** 更新内联视图项的矩形尺寸 */
    updateInlineViewSize(nodeId: string, width: number, height: number): void {
      mainView().updateInlineViewSize(nodeId, width, height)
    },

    // ── 网格模式（仅主视图启用）──
    /** 网格模式是否开启（只读 getter） */
    gridMode(): boolean {
      return mainView().isGridMode
    },
    /** 开启 / 关闭网格模式（视图状态，不入 undo、不持久化） */
    setGridMode(enabled: boolean): void {
      mainView().setGridMode(enabled)
    },
    /** 切换网格模式 */
    toggleGridMode(): void {
      mainView().toggleGridMode()
    },

    stats(): ViewStats {
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