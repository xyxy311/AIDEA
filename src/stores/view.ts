import { ref, computed, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { useNodeStore } from '@/stores/node'
import { snapFocus } from '@/utils/grid'

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
 * 视图 Store 工厂：'main' 单一主视图常驻（切换节点经改 viewedNodeId）；其他 viewId 为独立内联视图实例。
 * 仅管理视图状态（视口 / 选中 / 编辑 / 连线创建中 / 内联视图列表），不存任何节点/连线数据。
 * 内联视图的选中经 computed 共享主视图，使快捷键与属性面板能作用于内联选中的节点。
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

    // ── 选中（全局共享：主视图持有真实状态，内联视图通过 computed + action 转发引用主视图）──
    // 这样内联视图中选中节点/连线时，主视图的 selectedNodeIds/selectedConnectionIds 同步更新，
    // 使快捷键和右侧边栏属性编辑（均读取主视图选中）能作用于内联视图选中的节点。
    const isInline = savedInit?.type === 'inline'
    // 显式声明 any 打破循环类型推断（useViewStore 在自身工厂内引用自身）
    const mainView: any = isInline ? useViewStore('main') : null

    /** 主视图的真实选中节点 ID 集合（内联视图不持有，引用主视图） */
    const _ownSelectedNodeIds = isInline ? null : ref<Set<string>>(new Set())
    /** 主视图的真实选中连线 ID 集合（内联视图不持有，引用主视图） */
    const _ownSelectedConnectionIds = isInline ? null : ref<Set<string>>(new Set())

    /** 当前选中的节点 ID 集合（内联视图返回主视图的，实现全局选中共享） */
    const selectedNodeIds = isInline
      ? computed<Set<string>>(() => mainView!.selectedNodeIds)
      : _ownSelectedNodeIds!
    /** 当前选中的连线 ID 集合（内联视图返回主视图的） */
    const selectedConnectionIds = isInline
      ? computed<Set<string>>(() => mainView!.selectedConnectionIds)
      : _ownSelectedConnectionIds!

    // ── 编辑 ──
    /** 当前正在编辑的节点 ID */
    const editingNodeId = ref<string | null>(null)
    /** 当前正在编辑文字的连线 ID（双击连线触发） */
    const editingConnectionId = ref<string | null>(null)

    // ── 连线创建中 ──
    /** 正在创建连线时的起始节点 ID（null 表示不在创建连线模式） */
    const connectingFrom = ref<string | null>(null)

    // ── 网格模式（视图状态，仅主视图启用，不入 undo、不持久化）──
    /** 是否开启网格模式 */
    const gridMode = ref(false)
    /** 活动格焦点世界坐标（G/2 即 50 的倍数；null 表示未初始化） */
    const activeGrid = ref<{ x: number; y: number } | null>(null)

    /** 网格模式是否开启（getter） */
    const isGridMode = computed(() => gridMode.value)

    // ── 跨视图拖拽 ──
    /** Stage 容器 DOM 引用（供坐标映射用 getBoundingClientRect） */
    const containerEl = shallowRef<HTMLElement | null>(null)

    // ── Getters ──
    /** 作为属性面板的基准节点 */
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
      // 内联视图转发主视图（全局选中共享）
      if (isInline) {
        mainView!.selectNode(nodeId, ctrlKey)
        return
      }
      // 节点与连线互斥：选中节点时总是清空连线选择
      _ownSelectedConnectionIds!.value = new Set()

      if (nodeId === null) {
        _ownSelectedNodeIds!.value = new Set()
        return
      }

      if (ctrlKey) {
        const newSet = new Set(_ownSelectedNodeIds!.value)
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId)
        } else {
          newSet.add(nodeId)
        }
        _ownSelectedNodeIds!.value = newSet
      } else {
        _ownSelectedNodeIds!.value = new Set([nodeId])
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
      // 内联视图转发主视图（全局选中共享）
      if (isInline) {
        mainView!.selectConnection(connectionId, ctrlKey)
        return
      }
      // 节点与连线互斥：选中连线时总是清空节点选择
      _ownSelectedNodeIds!.value = new Set()

      if (connectionId === null) {
        _ownSelectedConnectionIds!.value = new Set()
        return
      }

      if (ctrlKey) {
        const newSet = new Set(_ownSelectedConnectionIds!.value)
        if (newSet.has(connectionId)) {
          newSet.delete(connectionId)
        } else {
          newSet.add(connectionId)
        }
        _ownSelectedConnectionIds!.value = newSet
      } else {
        _ownSelectedConnectionIds!.value = new Set([connectionId])
      }
    }

    /** 清空所有选中（节点和连线） */
    function clearSelection(): void {
      // 内联视图转发主视图（全局选中共享）
      if (isInline) {
        mainView!.clearSelection()
        return
      }
      _ownSelectedNodeIds!.value = new Set()
      _ownSelectedConnectionIds!.value = new Set()
    }

    /**
     * 从选中集合中移除已不存在的节点/连线 ID（数据删除 / undo-redo 后调用）。
     * 仅当选中集合实际变化时才替换 Set（保持引用稳定，避免无意义的渲染 / watch 触发）。
     */
    function pruneSelection(validNodeIds: Set<string>, validConnectionIds: Set<string>): void {
      // 内联视图转发主视图（全局选中共享）
      if (isInline) {
        mainView!.pruneSelection(validNodeIds, validConnectionIds)
        return
      }
      const newNodeIds = new Set(
        Array.from(_ownSelectedNodeIds!.value).filter((id) => validNodeIds.has(id)),
      )
      const newConnIds = new Set(
        Array.from(_ownSelectedConnectionIds!.value).filter((id) => validConnectionIds.has(id)),
      )
      if (newNodeIds.size !== _ownSelectedNodeIds!.value.size) {
        _ownSelectedNodeIds!.value = newNodeIds
      }
      if (newConnIds.size !== _ownSelectedConnectionIds!.value.size) {
        _ownSelectedConnectionIds!.value = newConnIds
      }
    }

    /**
     * 批量设置选中节点（供框选使用）
     * - additive=false（默认）：替换当前选中为 ids，并清空连线选中
     * - additive=true：将 ids 追加到当前选中节点集合（去重），清空连线选中
     */
    function setSelectedNodes(ids: string[], additive?: boolean): void {
      // 内联视图转发主视图（全局选中共享）
      if (isInline) {
        mainView!.setSelectedNodes(ids, additive)
        return
      }
      // 节点与连线互斥：清空连线选中
      _ownSelectedConnectionIds!.value = new Set()

      if (additive) {
        const newSet = new Set(_ownSelectedNodeIds!.value)
        for (const id of ids) {
          newSet.add(id)
        }
        _ownSelectedNodeIds!.value = newSet
      } else {
        _ownSelectedNodeIds!.value = new Set(ids)
      }
    }

    // ── 编辑 ──

    function startEditing(nodeId: string): void {
      editingNodeId.value = nodeId
    }

    function stopEditing(): void {
      editingNodeId.value = null
    }

    /** 开始编辑连线文字（双击连线触发） */
    function startEditingConnection(connectionId: string): void {
      editingConnectionId.value = connectionId
    }

    /** 结束连线文字编辑 */
    function stopEditingConnection(): void {
      editingConnectionId.value = null
    }

    // ── 视口 ──

    /** 设置画布视口（平移 + 缩放） */
    function setViewport(x: number, y: number, scale: number): void {
      stageX.value = x
      stageY.value = y
      stageScale.value = scale
    }

    // ── 网格模式操作 ──

    /**
     * 设置 / 取消网格模式（视图状态，不入 undo、不持久化）
     *
     * 仅主视图启用：内联视图直接忽略（return）。
     * 开启时若当前有选中节点，焦点放到该节点中心（吸附到 G/2 的整数倍）；
     * 否则 activeGrid 置为 null，由 CanvasStage 按视口中心初始化（setActiveGrid）。
     * 关闭时清空 activeGrid，保证下次开启走完整初始化。
     */
    function setGridMode(enabled: boolean): void {
      // 内联视图不启用网格（硬守卫）
      if (isInline) return
      gridMode.value = enabled
      if (enabled) {
        const id = selectedNodeId.value
        if (id) {
          const n = useNodeStore().getNode(id)
          if (n) {
            activeGrid.value = {
              x: snapFocus(n.x + n.width / 2),
              y: snapFocus(n.y + n.height / 2),
            }
            return
          }
        }
        activeGrid.value = null
      } else {
        // 关闭时清空焦点，保证下次开启走完整初始化
        activeGrid.value = null
      }
    }

    /** 切换网格模式 */
    function toggleGridMode(): void {
      setGridMode(!gridMode.value)
    }

    /** 设置活动格焦点（世界坐标，应吸附到 G/2 的整数倍） */
    function setActiveGrid(x: number, y: number): void {
      activeGrid.value = { x, y }
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
      if (isInline) {
        // 内联视图：选中归主视图管理，清全局选中；编辑/连线创建是本视图私有
        mainView!.clearSelection()
      } else {
        _ownSelectedNodeIds!.value = new Set()
        _ownSelectedConnectionIds!.value = new Set()
      }
      editingNodeId.value = null
      editingConnectionId.value = null
      connectingFrom.value = null
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
      editingConnectionId,
      // 连线创建
      connectingFrom,
      // 网格模式
      gridMode,
      activeGrid,
      isGridMode,
      // 跨视图拖拽
      containerEl,
      // 操作
      selectNode,
      selectConnection,
      clearSelection,
      pruneSelection,
      setSelectedNodes,
      startEditing,
      stopEditing,
      startEditingConnection,
      stopEditingConnection,
      setViewport,
      setGridMode,
      toggleGridMode,
      setActiveGrid,
      resetViewState,
    }
  })()
}
