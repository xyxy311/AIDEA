import { ref, computed, shallowRef, triggerRef } from 'vue'
import { defineStore } from 'pinia'
import type { WhiteboardNode, Connection, ConnectionPresetStyle } from '@/types'
import { useProjectStore } from '@/stores/project'
import {
  DEFAULT_NODE_WIDTH,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_TEXT,
  MIN_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  DEFAULT_LINE_STYLE,
  CONNECTION_STROKE_COLOR,
  CONNECTION_STROKE_WIDTH,
  DEFAULT_CONNECTION_DIRECTED,
  type PresetStyle,
} from '@/constants'
import { generateId } from '@/utils/id'

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
    const nodes = shallowRef<Map<string, WhiteboardNode>>(new Map())

    /** 当前选中节点 ID */
    const selectedNodeId = ref<string | null>(null)

    /** 当前正在编辑的节点 ID */
    const editingNodeId = ref<string | null>(null)

    /** 画布视口 X 偏移 */
    const stageX = ref(0)
    /** 画布视口 Y 偏移 */
    const stageY = ref(0)
    /** 画布缩放倍率 */
    const stageScale = ref(1)
    /** 是否处于平移模式 */
    const isPanMode = ref(false)

    // ===== 连线 =====
    /** 连线数据 Map */
    const connections = shallowRef<Map<string, Connection>>(new Map())
    /** 正在创建连线时的起始节点 ID（null 表示不在创建连线模式） */
    const connectingFrom = ref<string | null>(null)
    /** 当前选中连线 ID */
    const selectedConnectionId = ref<string | null>(null)

    // ── Getters ──

    /** 当前白板的所有节点 */
    const nodesArray = computed<WhiteboardNode[]>(() =>
      Array.from(nodes.value.values()),
    )

  /** 当前选中的节点对象 */
  const selectedNode = computed<WhiteboardNode | null>(() => {
    if (selectedNodeId.value === null) return null
    const n = nodes.value.get(selectedNodeId.value)
    // 必须展开为新对象——shallowRef<Map> 配合 triggerRef 时
    // Map 中对象引用不变，computed 按 === 比较会跳过下游通知
    return n ? { ...n } : null
  })

  /**
   * 白板名称——从项目 store 中读取，保持单一数据源。
   * 当项目 store 的 renameWhiteboard 更新名称时，此计算属性自动同步。
   */
  const name = computed(() => {
    const project = useProjectStore()
    return project.whiteboards.find((w) => w.id === whiteboardId)?.name ?? '白板'
  })

  /** 所有连线（数组形式） */
  const connectionsArray = computed<Connection[]>(() =>
    Array.from(connections.value.values()),
  )

  /** 当前选中连线 */
  const selectedConnection = computed<Connection | null>(() => {
    if (selectedConnectionId.value === null) return null
    const c = connections.value.get(selectedConnectionId.value)
    // 必须展开为新对象——shallowRef<Map> 配合 triggerRef 时
    // Map 中对象引用不变，computed 按 === 比较会跳过下游通知
    return c ? { ...c } : null
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

      nodes.value.set(nodeId, node)
      triggerRef(nodes)

      selectedNodeId.value = nodeId
      editingNodeId.value = nodeId

      return nodeId
    }

    function deleteNode(nodeId: string): void {
      // 先删除该节点的所有连线
      deleteNodeConnections(nodeId)

      nodes.value.delete(nodeId)
      triggerRef(nodes)

      if (selectedNodeId.value === nodeId) {
        selectedNodeId.value = null
      }
      if (editingNodeId.value === nodeId) {
        editingNodeId.value = null
      }
    }

    function selectNode(nodeId: string | null): void {
      selectedNodeId.value = nodeId
      if (nodeId !== null) {
        selectedConnectionId.value = null
      }
    }

    function moveNode(nodeId: string, x: number, y: number): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.x = x
      node.y = y
      triggerRef(nodes)
    }

    function resizeNode(
      nodeId: string,
      x: number,
      y: number,
      width: number,
      height: number,
    ): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.x = x
      node.y = y
      node.width = Math.max(width, MIN_NODE_WIDTH)
      node.height = Math.max(height, MIN_NODE_HEIGHT)
      triggerRef(nodes)
    }

    // ── Actions: 文本编辑 ──

    function startEditing(nodeId: string): void {
      editingNodeId.value = nodeId
    }

    function stopEditing(): void {
      editingNodeId.value = null
    }

    function setNodeText(nodeId: string, text: string): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.text = text
      triggerRef(nodes)
      editingNodeId.value = null
    }

    /**
     * 更新节点文本（不改变编辑状态）
     * 供侧边栏属性编辑器使用，与画布内联编辑器（setNodeText）区分。
     */
    function updateNodeText(nodeId: string, text: string): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.text = text
      triggerRef(nodes)
    }

    // ── Actions: 节点样式 ──

    function setNodeTextColor(nodeId: string, color: string): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.textColor = color
      triggerRef(nodes)
    }

    function setNodeBackgroundColor(nodeId: string, color: string): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.backgroundColor = color
      triggerRef(nodes)
    }

    function setNodeBorderColor(nodeId: string, color: string): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.borderColor = color
      triggerRef(nodes)
    }

    function applyPresetStyle(nodeId: string, preset: PresetStyle): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.backgroundColor = preset.backgroundColor
      node.borderColor = preset.borderColor
      node.textColor = preset.textColor
      triggerRef(nodes)
    }

    /**
     * 应用连线预设样式
     * 预设覆盖 lineStyle / strokeWidth / strokeColor / directed 四个属性。
     */
    function applyConnectionPreset(
      connectionId: string,
      preset: Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed'>,
    ): void {
      const conn = connections.value.get(connectionId)
      if (!conn) return
      conn.lineStyle = preset.lineStyle
      conn.strokeWidth = preset.strokeWidth
      conn.strokeColor = preset.strokeColor
      conn.directed = preset.directed
      triggerRef(connections)
    }

    function resetNodeStyle(nodeId: string): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.backgroundColor = undefined
      node.borderColor = undefined
      node.textColor = undefined
      triggerRef(nodes)
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
      const map = new Map(connections.value)
      if (map.has(newConnection.id)) return
      map.set(newConnection.id, newConnection)
      connections.value = map
    }

    /** 删除单条连线 */
    function deleteConnection(connectionId: string): void {
      const map = new Map(connections.value)
      if (map.delete(connectionId)) {
        connections.value = map
      }
    }

    /** 删除指定节点的所有连线（当节点被删除时调用） */
    function deleteNodeConnections(nodeId: string): void {
      const map = new Map(connections.value)
      let changed = false
      for (const [key, conn] of map) {
        if (conn.fromNodeId === nodeId || conn.toNodeId === nodeId) {
          map.delete(key)
          changed = true
        }
      }
      if (changed) {
        connections.value = map
      }
    }

    /** 获取指定节点的所有连线 */
    function getNodeConnections(nodeId: string): Connection[] {
      return connectionsArray.value.filter(
        (c) => c.fromNodeId === nodeId || c.toNodeId === nodeId,
      )
    }

    /** 选中/取消选中连线（与节点选中互斥） */
    function selectConnection(connectionId: string | null): void {
      selectedConnectionId.value = connectionId
      if (connectionId !== null) {
        selectedNodeId.value = null
      }
    }

    /** 更新连线属性（部分更新） */
    function updateConnection(
      connectionId: string,
      partial: Partial<Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed'>>,
    ): void {
      const conn = connections.value.get(connectionId)
      if (!conn) return
      Object.assign(conn, partial)
      triggerRef(connections)
    }

    // ── Actions: 状态重置 ──

    /**
     * 重置白板交互状态（切换白板时调用）
     *
     * 当前仅清除选中和编辑状态，后续可扩展（如重置视口位置等）。
     */
    function resetBoardState(): void {
      selectedNodeId.value = null
      editingNodeId.value = null
      connectingFrom.value = null
      selectedConnectionId.value = null
    }

    return {
      // State
      whiteboardId,
      nodes,
      selectedNodeId,
      editingNodeId,
      stageX,
      stageY,
      stageScale,
      isPanMode,
      // Getters
      nodesArray,
      selectedNode,
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
      //   连线
      connections,
      connectionsArray,
      connectingFrom,
      selectedConnectionId,
      selectedConnection,
      selectConnection,
      addConnection,
      deleteConnection,
      deleteNodeConnections,
      getNodeConnections,
      updateConnection,
      applyConnectionPreset,
      resetBoardState,
    }
  })()
}
