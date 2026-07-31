import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

/**
 * 视图 Store 工厂 - 每个节点视图（白板）拥有独立的 store 实例
 *
 * 使用 `useViewStore(viewId)` 获取指定视图的 store（viewId = 被查看的节点 ID）。
 *
 * 仅管理视图状态：视口（平移 / 缩放）、选中、编辑、连线创建中状态。
 * 不存储任何节点 / 连线数据（数据归全局 nodeStore）。
 */
export function useViewStore(viewId: string) {
  const storeId = `view-${viewId}`

  return defineStore(storeId, () => {
    // ── 视口 ──
    /** 画布视口 X 偏移 */
    const stageX = ref(0)
    /** 画布视口 Y 偏移 */
    const stageY = ref(0)
    /** 画布缩放倍率 */
    const stageScale = ref(1)

    // ── 选中 ──
    /** 当前选中的节点 ID 集合（支持多选） */
    const selectedNodeIds = ref<Set<string>>(new Set())
    /** 当前选中的连线 ID 集合（支持多选） */
    const selectedConnectionIds = ref<Set<string>>(new Set())

    // ── 编辑 ──
    /** 当前正在编辑的节点 ID */
    const editingNodeId = ref<string | null>(null)

    // ── 连线创建中 ──
    /** 正在创建连线时的起始节点 ID（null 表示不在创建连线模式） */
    const connectingFrom = ref<string | null>(null)

    // ── Getters ──

    const selectedNodeId = computed(() => {
      const ids = Array.from(selectedNodeIds.value)
      return ids[0] ?? null
    })

    const selectedConnectionId = computed(() => {
      const ids = Array.from(selectedConnectionIds.value)
      return ids[0] ?? null
    })

    // ── 选中操作 ──

    /**
     * 选中 / 取消选中节点
     * - ctrlKey=false（默认）：单选替换模式，选中的连线全部清除
     * - ctrlKey=true：在 Set 中 toggle 该节点，连线全部清除
     * - nodeId=null：清空节点选择
     * 节点与连线选择互斥--选中节点时总是清空连线选择
     */
    function selectNode(nodeId: string | null, ctrlKey?: boolean): void {
      // 节点与连线互斥：选中节点时总是清空连线选择
      selectedConnectionIds.value = new Set()

      if (nodeId === null) {
        selectedNodeIds.value = new Set()
        return
      }

      if (ctrlKey) {
        const newSet = new Set(selectedNodeIds.value)
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId)
        } else {
          newSet.add(nodeId)
        }
        selectedNodeIds.value = newSet
      } else {
        selectedNodeIds.value = new Set([nodeId])
      }
    }

    /**
     * 选中 / 取消选中连线
     * - ctrlKey=false（默认）：单选替换模式，选中的节点全部清除
     * - ctrlKey=true：在 Set 中 toggle 该连线，节点全部清除
     * - connectionId=null：清空连线选择
     * 节点与连线选择互斥--选中连线时总是清空节点选择
     */
    function selectConnection(connectionId: string | null, ctrlKey?: boolean): void {
      // 节点与连线互斥：选中连线时总是清空节点选择
      selectedNodeIds.value = new Set()

      if (connectionId === null) {
        selectedConnectionIds.value = new Set()
        return
      }

      if (ctrlKey) {
        const newSet = new Set(selectedConnectionIds.value)
        if (newSet.has(connectionId)) {
          newSet.delete(connectionId)
        } else {
          newSet.add(connectionId)
        }
        selectedConnectionIds.value = newSet
      } else {
        selectedConnectionIds.value = new Set([connectionId])
      }
    }

    /** 清空所有选中（节点和连线） */
    function clearSelection(): void {
      selectedNodeIds.value = new Set()
      selectedConnectionIds.value = new Set()
    }

    /**
     * 批量设置选中节点（供框选使用）
     * - additive=false（默认）：替换当前选中为 ids，并清空连线选中
     * - additive=true：将 ids 追加到当前选中节点集合（去重），清空连线选中
     */
    function setSelectedNodes(ids: string[], additive?: boolean): void {
      // 节点与连线互斥：清空连线选中
      selectedConnectionIds.value = new Set()

      if (additive) {
        const newSet = new Set(selectedNodeIds.value)
        for (const id of ids) {
          newSet.add(id)
        }
        selectedNodeIds.value = newSet
      } else {
        selectedNodeIds.value = new Set(ids)
      }
    }

    // ── 编辑 ──

    function startEditing(nodeId: string): void {
      editingNodeId.value = nodeId
    }

    function stopEditing(): void {
      editingNodeId.value = null
    }

    // ── 视口 ──

    /** 设置画布视口（平移 + 缩放） */
    function setViewport(x: number, y: number, scale: number): void {
      stageX.value = x
      stageY.value = y
      stageScale.value = scale
    }

    // ── 状态重置 ──

    /**
     * 重置视图交互状态（切换视图时调用）
     *
     * 清除选中、编辑、连线创建状态；视口保留（各视图独立记忆平移/缩放）。
     */
    function resetViewState(): void {
      selectedNodeIds.value = new Set()
      editingNodeId.value = null
      connectingFrom.value = null
      selectedConnectionIds.value = new Set()
    }

    return {
      // 视口
      stageX,
      stageY,
      stageScale,
      // 选中
      selectedNodeIds,
      selectedConnectionIds,
      selectedNodeId,
      selectedConnectionId,
      // 编辑
      editingNodeId,
      // 连线创建
      connectingFrom,
      // 操作
      selectNode,
      selectConnection,
      clearSelection,
      setSelectedNodes,
      startEditing,
      stopEditing,
      setViewport,
      resetViewState,
    }
  })()
}
