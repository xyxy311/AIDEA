import { ref, computed, shallowRef } from 'vue'
import { defineStore } from 'pinia'

/** 内联视图项（宿主视图持有的展开状态） */
export interface InlineViewItem {
  /** 被展开的节点 ID */
  nodeId: string
  /** 内联视图实例的 viewId */
  viewId: string
  /** 矩形宽度（视图状态，不入 undo） */
  width: number
  /** 矩形高度（视图状态，不入 undo） */
  height: number
}

/** 视图初始化参数（首次创建 store 时使用） */
export interface ViewStoreInit {
  nodeId: string
  type: 'main' | 'inline'
  hostViewId?: string | null
}

/** 存储每个 viewId 的初始化参数（只读一次，创建后清除） */
const viewStoreInits = new Map<string, ViewStoreInit>()

/**
 * 视图 Store 工厂
 *
 * viewId 区分：
 * - 'main'：单一主视图实例，常驻。切换查看的节点通过改 viewedNodeId 实现。
 * - 其他值：内联视图实例，每个独立。
 *
 * 仅管理视图状态：视口（平移 / 缩放）、选中、编辑、连线创建中、内联视图列表。
 * 不存储任何节点 / 连线数据（数据归全局 nodeStore）。
 *
 * @param init 首次创建时传入的初始化参数（后续调用忽略）
 */
export function useViewStore(viewId: string, init?: ViewStoreInit) {
  const storeId = `view-${viewId}`

  if (init) {
    viewStoreInits.set(storeId, init)
  }

  return defineStore(storeId, () => {
    const savedInit = viewStoreInits.get(storeId)
    // 读取后清除，避免后续误用
    if (savedInit) {
      viewStoreInits.delete(storeId)
    }

    // ── 视图关联节点（主视图可变，内联视图固定）──
    /** 当前查看的节点 ID（主视图可变，内联视图首次初始化后不变） */
    const viewedNodeId = ref<string>(savedInit?.nodeId ?? viewId)
    /** 视图类型 */
    const type = ref<'main' | 'inline'>(savedInit?.type ?? 'inline')
    /** 宿主视图 ID（仅 inline 有值） */
    const hostViewId = ref<string | null>(savedInit?.hostViewId ?? null)

    // ── 内联视图列表（仅主视图持有）──
    /** 展开的内联视图项列表 */
    const inlineViews = ref<InlineViewItem[]>([])

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

    // ── 跨视图拖拽 ──
    /** Stage 容器 DOM 引用（供坐标映射用 getBoundingClientRect） */
    const containerEl = shallowRef<HTMLElement | null>(null)

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

    // ── 内联视图操作 ──

    /** 添加内联视图项（已存在同 nodeId 则忽略） */
    function addInlineView(nodeId: string, viewId: string, width: number, height: number): void {
      if (inlineViews.value.some((iv) => iv.nodeId === nodeId)) return
      inlineViews.value.push({ nodeId, viewId, width, height })
    }

    /** 移除内联视图项 */
    function removeInlineView(nodeId: string): void {
      inlineViews.value = inlineViews.value.filter((iv) => iv.nodeId !== nodeId)
    }

    /** 更新内联视图项的尺寸 */
    function updateInlineViewSize(nodeId: string, width: number, height: number): void {
      const iv = inlineViews.value.find((iv) => iv.nodeId === nodeId)
      if (iv) {
        iv.width = width
        iv.height = height
      }
    }

    /** 获取内联视图项的矩形尺寸（不含位置 x/y，由调用方拼 node.x/node.y） */
    function getInlineViewRect(nodeId: string): { width: number; height: number } | null {
      const iv = inlineViews.value.find((iv) => iv.nodeId === nodeId)
      return iv ? { width: iv.width, height: iv.height } : null
    }

    // ── 状态重置 ──

    /**
     * 重置视图交互状态（切换视图时调用）
     *
     * 清除选中、编辑、连线创建状态；视口保留（各视图独立记忆平移/缩放）。
     * 不清除 inlineViews。
     */
    function resetViewState(): void {
      selectedNodeIds.value = new Set()
      editingNodeId.value = null
      connectingFrom.value = null
      selectedConnectionIds.value = new Set()
    }

    return {
      // 视图关联
      viewedNodeId,
      type,
      hostViewId,
      // 内联视图
      inlineViews,
      addInlineView,
      removeInlineView,
      updateInlineViewSize,
      getInlineViewRect,
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
      // 跨视图拖拽
      containerEl,
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
