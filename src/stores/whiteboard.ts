import { ref, computed, reactive } from 'vue'
import { defineStore } from 'pinia'
import type { WhiteboardNode, Connection, ConnectionPresetStyle } from '@/types'
import { useProjectStore } from '@/stores/project'
import {
  DEFAULT_NODE_WIDTH,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_TEXT,
  MIN_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  NODE_PADDING,
  NODE_LINE_HEIGHT,
  DEFAULT_NODE_STYLE,
  DEFAULT_LINE_STYLE,
  CONNECTION_STROKE_COLOR,
  CONNECTION_STROKE_WIDTH,
  DEFAULT_CONNECTION_DIRECTED,
  type PresetStyle,
} from '@/constants'
import { generateId } from '@/utils/id'
import { calculateTextContentSize } from '@/utils/geometry'

/**
 * 白板 Store 工厂 — 每个白板拥有独立的 store 实例
 *
 * 使用 `useWhiteboardStore(id)` 获取指定白板的 store。
 * 同一 id 多次调用返回同一实例（Pinia 自动管理）。
 *
 * 每个实例管理：
 *   - 该白板的所有节点（CRUD + 样式）
 *   - 选中/编辑状态
 *   - 导航状态（平移 + 缩放）
 */
export function useWhiteboardStore(id: string) {
  const storeId = `whiteboard-${id}`

  return defineStore(storeId, () => {
    // ── State ──

    /** 所属白板 ID（冗余存储，方便调试） */
    const whiteboardId = id

    /** 节点存储：Map<id, WhiteboardNode> */
    const nodes = reactive(new Map<string, WhiteboardNode>())

    /** 当前选中的节点 ID 集合（支持多选） */
    const selectedNodeIds = ref<Set<string>>(new Set())

    /** 当前选中的连线 ID 集合（支持多选） */
    const selectedConnectionIds = ref<Set<string>>(new Set())

    /** 当前正在编辑的节点 ID */
    const editingNodeId = ref<string | null>(null)

    /** 画布视口 X 偏移 */
    const stageX = ref(0)
    /** 画布视口 Y 偏移 */
    const stageY = ref(0)
    /** 画布缩放倍率 */
    const stageScale = ref(1)

    // ===== 连线 =====
    /** 连线数据 Map */
    const connections = reactive(new Map<string, Connection>())
    /** 正在创建连线时的起始节点 ID（null 表示不在创建连线模式） */
    const connectingFrom = ref<string | null>(null)


    // ── Getters ──

    /** 当前白板的所有节点 */
    const nodesArray = computed<WhiteboardNode[]>(() =>
      Array.from(nodes.values()),
    )

    /** 当前白板的所有连线 */
    const connectionsArray = computed<Connection[]>(() =>
      Array.from(connections.values()),
    )

  /**
   * 白板名称——从项目 store 中读取，保持单一数据源。
   * 当项目 store 的 renameWhiteboard 更新名称时，此计算属性自动同步。
   */
  const name = computed(() => {
    const project = useProjectStore()
    return project.whiteboards.find((w) => w.id === whiteboardId)?.name ?? '白板'
  })

  const selectedNodeId = computed(() => {
    const ids = Array.from(selectedNodeIds.value)
    return ids[0] ?? null
  })

  const selectedConnectionId = computed(() => {
    const ids = Array.from(selectedConnectionIds.value)
    return ids[0] ?? null
  })

    // ── Actions: 节点 CRUD ──

    function addNode(x: number, y: number, text?: string): string {
      const nodeId = generateId()
      const node: WhiteboardNode = {
        id: nodeId,
        x,
        y,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        text: text ?? DEFAULT_NODE_TEXT,
      }

      nodes.set(nodeId, node)

      selectedNodeIds.value = new Set([nodeId])
      editingNodeId.value = nodeId

      return nodeId
    }

    function deleteNode(nodeId: string): void {
      // 先删除该节点的所有连线
      deleteNodeConnections(nodeId)

      nodes.delete(nodeId)

      const newNodeSet = new Set(selectedNodeIds.value)
      newNodeSet.delete(nodeId)
      selectedNodeIds.value = newNodeSet
      if (editingNodeId.value === nodeId) {
        editingNodeId.value = null
      }
    }

    /**
     * 选中 / 取消选中节点
     * - ctrlKey=false（默认）：单选替换模式，选中的连线全部清除
     * - ctrlKey=true：在 Set 中 toggle 该节点，连线全部清除
     * - nodeId=null：清空节点选择
     * 节点与连线选择互斥——选中节点时总是清空连线选择
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

    function moveNode(nodeId: string, x: number, y: number): void {
      const node = nodes.get(nodeId)
      if (!node) return
      node.x = x
      node.y = y
    }

    function resizeNode(
      nodeId: string,
      x: number,
      y: number,
      width: number,
      height: number,
    ): void {
      const node = nodes.get(nodeId)
      if (!node) return
      node.x = x
      node.y = y
      node.width = Math.max(width, MIN_NODE_WIDTH)
      node.height = Math.max(height, MIN_NODE_HEIGHT)
      // 确保文字能完整显示（用户缩小后若放不下文字仍会自动调大）
      fitNodeToText(nodeId)
    }

    /**
     * 根据文本内容自动调整节点尺寸（只扩大不缩小）。
     *
     * 确保节点能完整显示所有文字：
     * 1. 保证内容区至少能容纳一个字符（padding 两侧 + 一个字号）
     * 2. 在当前宽度下模拟按字符换行，计算所需高度
     * 3. 若某行宽度超出内容区，扩大宽度
     * 4. 若所需高度超出当前高度，扩大高度
     */
    function fitNodeToText(nodeId: string): void {
      const node = nodes.get(nodeId)
      if (!node) return

      const { fontSize, fontFamily } = DEFAULT_NODE_STYLE
      const padding = NODE_PADDING
      const lineHeight = NODE_LINE_HEIGHT

      // 保证内容区宽度 ≥ 一个字号（否则 Konva Text 内容区为负，渲染异常）
      const minFitWidth = padding * 2 + fontSize
      if (node.width < minFitWidth) {
        node.width = minFitWidth
      }

      const contentWidth = node.width - padding * 2

      const contentSize = calculateTextContentSize(
        node.text,
        fontSize,
        fontFamily,
        contentWidth,
        lineHeight,
      )

      // 有行比内容区宽（单字符即超宽）-> 扩大宽度
      if (contentSize.width > contentWidth) {
        node.width = contentSize.width + padding * 2
      }

      // 高度不足以容纳所有行 -> 扩大高度（至少能放一行）
      const minFitHeight = padding * 2 + Math.ceil(fontSize * lineHeight)
      const requiredHeight = Math.max(contentSize.height + padding * 2, minFitHeight)
      if (requiredHeight > node.height) {
        node.height = requiredHeight
      }
    }

    // ── Actions: 文本编辑 ──

    function startEditing(nodeId: string): void {
      editingNodeId.value = nodeId
    }

    function stopEditing(): void {
      editingNodeId.value = null
    }

    function setNodeText(nodeId: string, text: string): void {
      const node = nodes.get(nodeId)
      if (!node) return
      node.text = text
      editingNodeId.value = null
      fitNodeToText(nodeId)
    }

    /**
     * 更新节点文本（不改变编辑状态）
     * 供侧边栏属性编辑器使用，与画布内联编辑器（setNodeText）区分。
     */
    function updateNodeText(nodeId: string, text: string): void {
      const node = nodes.get(nodeId)
      if (!node) return
      node.text = text
      fitNodeToText(nodeId)
    }

    // ── Actions: 节点样式 ──

    function setNodeTextColor(nodeId: string, color: string): void {
      const node = nodes.get(nodeId)
      if (!node) return
      node.textColor = color
    }

    function setNodeBackgroundColor(nodeId: string, color: string): void {
      const node = nodes.get(nodeId)
      if (!node) return
      node.backgroundColor = color
    }

    function setNodeBorderColor(nodeId: string, color: string): void {
      const node = nodes.get(nodeId)
      if (!node) return
      node.borderColor = color
    }

    function applyPresetStyle(nodeId: string, preset: PresetStyle): void {
      const node = nodes.get(nodeId)
      if (!node) return
      node.backgroundColor = preset.backgroundColor
      node.borderColor = preset.borderColor
      node.textColor = preset.textColor
    }

    /**
     * 应用连线预设样式
     * 预设覆盖 lineStyle / strokeWidth / strokeColor / directed 四个属性。
     */
    function applyConnectionPreset(
      connectionId: string,
      preset: Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed'>,
    ): void {
      const conn = connections.get(connectionId)
      if (!conn) return
      conn.lineStyle = preset.lineStyle
      conn.strokeWidth = preset.strokeWidth
      conn.strokeColor = preset.strokeColor
      conn.directed = preset.directed
    }

    function resetNodeStyle(nodeId: string): void {
      const node = nodes.get(nodeId)
      if (!node) return
      node.backgroundColor = undefined
      node.borderColor = undefined
      node.textColor = undefined
    }

    // ===== 连线操作 =====

    /** 添加连线 */
    function addConnection(fromNodeId: string, toNodeId: string): void {
      const newConnection: Connection = {
        id: fromNodeId < toNodeId ? toNodeId + fromNodeId : fromNodeId + toNodeId,
        fromNodeId,
        toNodeId,
        lineStyle: DEFAULT_LINE_STYLE,
        strokeWidth: CONNECTION_STROKE_WIDTH,
        strokeColor: CONNECTION_STROKE_COLOR,
        directed: DEFAULT_CONNECTION_DIRECTED,
      }
      if (connections.has(newConnection.id)) return
      connections.set(newConnection.id, newConnection)
    }

    /** 删除单条连线 */
    function deleteConnection(connectionId: string): void {
      connections.delete(connectionId)
    }

    /** 删除指定节点的所有连线（当节点被删除时调用） */
    function deleteNodeConnections(nodeId: string): void {
      const toDelete: string[] = []
      for (const [key, conn] of connections) {
        if (conn.fromNodeId === nodeId || conn.toNodeId === nodeId) {
          toDelete.push(key)
        }
      }
      for (const key of toDelete) {
        connections.delete(key)
      }
    }

    /**
     * 选中 / 取消选中连线
     * - ctrlKey=false（默认）：单选替换模式，选中的节点全部清除
     * - ctrlKey=true：在 Set 中 toggle 该连线，节点全部清除
     * - connectionId=null：清空连线选择
     * 节点与连线选择互斥——选中连线时总是清空节点选择
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

    /** 更新连线属性（部分更新） */
    function updateConnection(
      connectionId: string,
      partial: Partial<Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed'>>,
    ): void {
      const conn = connections.get(connectionId)
      if (!conn) return
      Object.assign(conn, partial)
    }

    /**
     * 清空所有选中（节点和连线）
     */
    function clearSelection(): void {
      selectedNodeIds.value = new Set()
      selectedConnectionIds.value = new Set()
    }

    /**
     * 批量设置选中节点（供框选使用）
     * - additive=false（默认）：替换当前选中为 ids，并清空连线选中（与 selectNode 互斥语义一致）
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

    /**
     * 批量更新所有选中节点的样式属性
     * 仅修改 selectedNodeIds 中的节点，不影响其他节点
     */
    function updateSelectedNodesStyle(partial: {
      textColor?: string
      backgroundColor?: string
      borderColor?: string
    }): void {
      for (const id of selectedNodeIds.value) {
        const node = nodes.get(id)
        if (!node) continue
        if (partial.textColor !== undefined) node.textColor = partial.textColor
        if (partial.backgroundColor !== undefined) node.backgroundColor = partial.backgroundColor
        if (partial.borderColor !== undefined) node.borderColor = partial.borderColor
      }
    }

    /**
     * 批量更新所有选中连线的样式属性
     * 仅修改 selectedConnectionIds 中的连线，不影响其他连线
     */
    function updateSelectedConnectionsStyle(partial: {
      lineStyle?: import('@/types').LineStyle
      strokeWidth?: number
      strokeColor?: string
      directed?: boolean
    }): void {
      for (const id of selectedConnectionIds.value) {
        const conn = connections.get(id)
        if (!conn) continue
        if (partial.lineStyle !== undefined) conn.lineStyle = partial.lineStyle
        if (partial.strokeWidth !== undefined) conn.strokeWidth = partial.strokeWidth
        if (partial.strokeColor !== undefined) conn.strokeColor = partial.strokeColor
        if (partial.directed !== undefined) conn.directed = partial.directed
      }
    }

    /**
     * 批量更新所有选中节点的文本内容
     */
    function updateSelectedNodesText(text: string): void {
      for (const id of selectedNodeIds.value) {
        const node = nodes.get(id)
        if (!node) continue
        node.text = text
        fitNodeToText(id)
      }
    }

    // ── Actions: 状态重置 ──

    /**
     * 重置白板交互状态（切换白板时调用）
     *
     * 当前仅清除选中和编辑状态，后续可扩展（如重置视口位置等）。
     */
    function resetBoardState(): void {
      selectedNodeIds.value = new Set()
      editingNodeId.value = null
      connectingFrom.value = null
      selectedConnectionIds.value = new Set()
    }

    return {
      // State
      whiteboardId,

      nodes,
      selectedNodeIds,
      editingNodeId,
      
      connections,
      connectingFrom,
      selectedConnectionIds,
      
      stageX,
      stageY,
      stageScale,
      // Getters
      nodesArray,
      connectionsArray,
      selectedNodeId,
      selectedConnectionId,
      name,
      // Actions
      addNode,
      deleteNode,
      selectNode,
      moveNode,
      resizeNode,
      setNodeText,
      updateNodeText,
      startEditing,
      stopEditing,
      setNodeTextColor,
      setNodeBackgroundColor,
      setNodeBorderColor,
      applyPresetStyle,
      resetNodeStyle,

      selectConnection,
      addConnection,
      deleteConnection,
      deleteNodeConnections,
      updateConnection,
      applyConnectionPreset,
      clearSelection,
      setSelectedNodes,

      updateSelectedNodesStyle,
      updateSelectedConnectionsStyle,
      updateSelectedNodesText,

      resetBoardState,
    }
  })()
}
