import { computed, reactive } from 'vue'
import { defineStore } from 'pinia'
import type { WhiteboardNode, Connection, ConnectionPresetStyle } from '@/types'
import {
  DEFAULT_NODE_STYLE,
  MIN_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  NODE_PADDING,
  NODE_LINE_HEIGHT,
  type PresetStyle,
} from '@/constants'
import { generateId } from '@/utils/id'
import { createNode, createConnection } from '@/utils/factory'
import { calculateTextContentSize } from '@/utils/geometry'

/** 根/项目节点 ID（全局唯一，parentId === null） */
export const ROOT_NODE_ID = 'root'

/**
 * 节点 Store - 全局唯一的节点树数据源
 *
 * 核心设计：
 * - 所有节点存于单一 Map，通过 parentId 构建树（邻接表模式）
 * - 连线嵌套在父节点的 connections 数组（同级关系归属父节点）
 * - childrenIndex 为 computed 派生索引，使子节点查询 / 递归删除均为高效
 * - 仅管理数据，不含选中 / 编辑 / 视口等视图状态（归 viewStore）
 * - 所有操作按节点 / 连线 ID 进行，不感知"选中"概念，
 *   批量操作由调用方传入 ID 列表，便于未来 undo/redo 以命令封装
 *
 * 根节点（ROOT_NODE_ID）在 store 初始化时创建，其 text 即项目名（单一数据源）。
 */
export const useNodeStore = defineStore('node', () => {
  // ── State ──

  /** 全部节点：Map<id, WhiteboardNode> */
  const nodes = reactive(new Map<string, WhiteboardNode>())

  // ── 初始化根节点 ──

  if (!nodes.has(ROOT_NODE_ID)) {
    nodes.set(
      ROOT_NODE_ID,
      createNode({
        id: ROOT_NODE_ID,
        parentId: null,
        text: '未命名项目',
      }),
    )
  }

  // ── 派生索引 ──

  /**
   * parentId -> 子节点 id[] 的派生索引。
   * 仅在 parentId 关系变化时重算（修改 text / 样式不触发）。
   * 使 childrenOf / descendantsOf 等查询免于遍历全表。
   */
  const childrenIndex = computed<Map<string, string[]>>(() => {
    const idx = new Map<string, string[]>()
    for (const n of nodes.values()) {
      if (n.parentId !== null) {
        const arr = idx.get(n.parentId)
        if (arr) arr.push(n.id)
        else idx.set(n.parentId, [n.id])
      }
    }
    return idx
  })

  // ── Getters ──

  /** 根节点（项目节点） */
  const rootNode = computed<WhiteboardNode | undefined>(() => nodes.get(ROOT_NODE_ID))

  // ── 查询 ──

  function getNode(id: string): WhiteboardNode | undefined {
    return nodes.get(id)
  }

  /** 某节点的直接子节点列表（每次返回新数组，规避引用相等陷阱） */
  function childrenOf(parentId: string): WhiteboardNode[] {
    const ids = childrenIndex.value.get(parentId) ?? []
    const result: WhiteboardNode[] = []
    for (const id of ids) {
      const n = nodes.get(id)
      if (n) result.push(n)
    }
    return result
  }

  /** 是否有子节点 */
  function hasChildren(id: string): boolean {
    return (childrenIndex.value.get(id)?.length ?? 0) > 0
  }

  /** 是否是某节点的直接子集 */
  function isChildOf(id: string, parentId: string): boolean {
    return childrenIndex.value.get(parentId)?.includes(id) ?? false
  }

  /**
   * 递归收集某节点的所有后代 ID（含自身）。
   * 沿 childrenIndex 走，O(子树大小)。
   */
  function descendantsOf(id: string): string[] {
    const result: string[] = []
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop()!
      result.push(cur)
      const childIds = childrenIndex.value.get(cur) ?? []
      for (const cid of childIds) stack.push(cid)
    }
    return result
  }

  /** 从节点到根的路径（含自身与根） */
  function pathToRoot(id: string): string[] {
    const result: string[] = []
    let cur: string | null = id
    while (cur) {
      result.push(cur)
      cur = nodes.get(cur)?.parentId ?? null
    }
    return result
  }

  /** 某节点持有的连线（其子级之间的连线） */
  function getConnections(parentId: string): Connection[] {
    return nodes.get(parentId)?.connections ?? []
  }

  /**
   * 全局查找连线及其所属父级（按连线 ID）。
   * 用于跨视图选中场景：选中连线可能来自主视图或任一内联视图宿主节点，
   * 调用方无需知道连线所属父级即可定位。
   */
  function findConnectionById(
    connectionId: string,
  ): { parentId: string; connection: Connection } | null {
    for (const [nodeId, node] of nodes) {
      const conn = node.connections.find((c) => c.id === connectionId)
      if (conn) return { parentId: nodeId, connection: conn }
    }
    return null
  }

  // ── 节点 CRUD ──

  /**
   * 创建节点
   *
   * 在 parentId 的视图中新建节点。返回新节点 ID。
   * 选中 / 编辑状态由调用方通过 viewStore 设置（数据与视图状态分离）。
   */
  function addNode(
    parentId: string,
    x: number,
    y: number,
    text?: string,
    options?: { id?: string },
  ): string {
    const nodeId = options?.id ?? generateId()
    const node = createNode({
      id: nodeId,
      parentId,
      x,
      y,
      text,
    })
    nodes.set(nodeId, node)
    return nodeId
  }

  /**
   * 删除节点及其整个子树，并从父节点 connections 清除相关连线。
   *
   * 仅处理数据；对应的 viewStore 实例销毁与活跃视图回退
   * 由调用方（project / composable）编排。
   */
  function deleteNode(id: string): void {
    if (id === ROOT_NODE_ID) return

    // 递归删除子节点（子的连线在本节点 connections 上，递归中逐步清理）
    const childIds = childrenIndex.value.get(id) ?? []
    for (const cid of childIds) {
      deleteNode(cid)
    }

    // 从父节点 connections 清除涉及本节点的连线
    const node = nodes.get(id)
    if (node?.parentId) {
      const parent = nodes.get(node.parentId)
      if (parent && parent.connections.length > 0) {
        parent.connections = parent.connections.filter(
          (c) => c.fromNodeId !== id && c.toNodeId !== id,
        )
      }
    }

    nodes.delete(id)
  }

  /** 批量删除节点（含各自子树） */
  function deleteNodes(ids: string[]): void {
    for (const id of ids) deleteNode(id)
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
    fitNodeToText(nodeId)
  }

  /**
   * 根据文本内容自动调整节点尺寸（只扩大不缩小）。
   * 逻辑与原 whiteboard store 一致，确保节点能完整显示所有文字。
   */
  function fitNodeToText(nodeId: string): void {
    const node = nodes.get(nodeId)
    if (!node) return

    const { fontSize, fontFamily } = DEFAULT_NODE_STYLE
    const padding = NODE_PADDING
    const lineHeight = NODE_LINE_HEIGHT

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

    if (contentSize.width > contentWidth) {
      node.width = contentSize.width + padding * 2
    }

    const minFitHeight = padding * 2 + Math.ceil(fontSize * lineHeight)
    const requiredHeight = Math.max(contentSize.height + padding * 2, minFitHeight)
    if (requiredHeight > node.height) {
      node.height = requiredHeight
    }
  }

  // ── 节点文本 ──

  /** 设置节点文本并结束编辑态（编辑态清除由 viewStore 负责，此处仅改数据） */
  function setNodeText(nodeId: string, text: string): void {
    const node = nodes.get(nodeId)
    if (!node) return
    node.text = text
    fitNodeToText(nodeId)
  }

  /** 更新节点文本（不改变编辑状态），供侧边栏属性编辑器使用 */
  function updateNodeText(nodeId: string, text: string): void {
    const node = nodes.get(nodeId)
    if (!node) return
    node.text = text
    fitNodeToText(nodeId)
  }

  // ── 节点样式 ──

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

  function resetNodeStyle(nodeId: string): void {
    const node = nodes.get(nodeId)
    if (!node) return
    node.backgroundColor = DEFAULT_NODE_STYLE.backgroundColor
    node.borderColor = DEFAULT_NODE_STYLE.borderColor
    node.textColor = DEFAULT_NODE_STYLE.textColor
  }

  /** 批量更新多个节点的样式属性（按 ID 列表，不感知选中） */
  function updateNodesStyle(
    ids: string[],
    partial: {
      textColor?: string
      backgroundColor?: string
      borderColor?: string
    },
  ): void {
    for (const id of ids) {
      const node = nodes.get(id)
      if (!node) continue
      if (partial.textColor !== undefined) node.textColor = partial.textColor
      if (partial.backgroundColor !== undefined) node.backgroundColor = partial.backgroundColor
      if (partial.borderColor !== undefined) node.borderColor = partial.borderColor
    }
  }

  /** 批量更新多个节点的文本内容（按 ID 列表） */
  function updateNodesText(ids: string[], text: string): void {
    for (const id of ids) {
      const node = nodes.get(id)
      if (!node) continue
      node.text = text
      fitNodeToText(id)
    }
  }

  /**
   * 将节点子树迁移到新父节点（组合 / 移动场景核心）。
   *
   * 仅修改 parentId 一个字段；该节点与其新兄弟间的连线
   * 由调用方通过 addConnection / deleteConnection 处理。
   * 内部连线（原兄弟间）若需随迁，也由调用方编排。
   */
  function reparentNode(nodeId: string, newParentId: string): void {
    const node = nodes.get(nodeId)
    if (!node) return
    if (nodeId === ROOT_NODE_ID) return
    node.parentId = newParentId
  }

  // ===== 连线操作（均作用于持有连线的父节点） =====

  /** 添加连线（加到 parentId 节点的 connections） */
  function addConnection(parentId: string, fromNodeId: string, toNodeId: string): void {
    const parent = nodes.get(parentId)
    if (!parent) return
    const conn = createConnection({ fromNodeId, toNodeId })
    if (parent.connections.some((c) => c.id === conn.id)) return
    parent.connections.push(conn)
  }

  /** 删除单条连线 */
  function deleteConnection(parentId: string, connectionId: string): void {
    const parent = nodes.get(parentId)
    if (!parent) return
    parent.connections = parent.connections.filter((c) => c.id !== connectionId)
  }

  /** 批量删除连线 */
  function deleteConnections(parentId: string, connectionIds: string[]): void {
    const parent = nodes.get(parentId)
    if (!parent) return
    const removeSet = new Set(connectionIds)
    parent.connections = parent.connections.filter((c) => !removeSet.has(c.id))
  }

  /**
   * 将连线从一个父节点迁移到另一个父节点（保留全部属性）。
   * 用于组合：选中节点的内部连线从原父视图迁到新容器节点。
   */
  function moveConnections(
    fromParentId: string,
    toParentId: string,
    connectionIds: string[],
  ): void {
    const from = nodes.get(fromParentId)
    const to = nodes.get(toParentId)
    if (!from || !to || connectionIds.length === 0) return
    const moveSet = new Set(connectionIds)
    const moved: Connection[] = []
    from.connections = from.connections.filter((c) => {
      if (moveSet.has(c.id)) {
        moved.push(c)
        return false
      }
      return true
    })
    for (const c of moved) {
      if (!to.connections.some((x) => x.id === c.id)) {
        to.connections.push(c)
      }
    }
  }

  /** 删除指定父节点中涉及某子节点的所有连线（子节点被删除时调用） */
  function deleteNodeConnections(parentId: string, nodeId: string): void {
    const parent = nodes.get(parentId)
    if (!parent) return
    parent.connections = parent.connections.filter(
      (c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId,
    )
  }

  /** 更新连线属性（部分更新） */
  function updateConnection(
    parentId: string,
    connectionId: string,
    partial: Partial<Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed'>>,
  ): void {
    const parent = nodes.get(parentId)
    if (!parent) return
    const conn = parent.connections.find((c) => c.id === connectionId)
    if (!conn) return
    Object.assign(conn, partial)
  }

  /** 应用连线预设样式 */
  function applyConnectionPreset(
    parentId: string,
    connectionId: string,
    preset: Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed'>,
  ): void {
    const parent = nodes.get(parentId)
    if (!parent) return
    const conn = parent.connections.find((c) => c.id === connectionId)
    if (!conn) return
    conn.lineStyle = preset.lineStyle
    conn.strokeWidth = preset.strokeWidth
    conn.strokeColor = preset.strokeColor
    conn.directed = preset.directed
  }

  /** 批量更新连线样式（按父节点 + 连线 ID 列表） */
  function updateConnectionsStyle(
    parentId: string,
    connectionIds: string[],
    partial: {
      lineStyle?: import('@/types').LineStyle
      strokeWidth?: number
      strokeColor?: string
      directed?: boolean
    },
  ): void {
    const parent = nodes.get(parentId)
    if (!parent) return
    for (const conn of parent.connections) {
      if (!connectionIds.includes(conn.id)) continue
      if (partial.lineStyle !== undefined) conn.lineStyle = partial.lineStyle
      if (partial.strokeWidth !== undefined) conn.strokeWidth = partial.strokeWidth
      if (partial.strokeColor !== undefined) conn.strokeColor = partial.strokeColor
      if (partial.directed !== undefined) conn.directed = partial.directed
    }
  }

  return {
    // State
    nodes,
    // Getters
    childrenIndex,
    rootNode,
    // 查询
    getNode,
    childrenOf,
    hasChildren,
    isChildOf,
    descendantsOf,
    pathToRoot,
    getConnections,
    findConnectionById,
    // 节点 CRUD
    addNode,
    deleteNode,
    deleteNodes,
    moveNode,
    resizeNode,
    fitNodeToText,
    // 节点文本
    setNodeText,
    updateNodeText,
    // 节点样式
    setNodeTextColor,
    setNodeBackgroundColor,
    setNodeBorderColor,
    applyPresetStyle,
    resetNodeStyle,
    updateNodesStyle,
    updateNodesText,
    reparentNode,
    // 连线
    addConnection,
    deleteConnection,
    deleteConnections,
    moveConnections,
    deleteNodeConnections,
    updateConnection,
    applyConnectionPreset,
    updateConnectionsStyle,
  }
})
