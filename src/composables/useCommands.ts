import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'
import type { Connection, LineStyle } from '@/types'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'
import {
  deepClone,
  captureNodeFull,
  captureNodeFields,
  captureSubtree,
  captureConnections,
  type DataPatch,
  type NodeChange,
  type ConnectionChange,
} from '@/utils/command'

/**
 * 命令层 - 数据写操作的统一入口
 *
 * 每个语义接口内部完成：捕获旧值 -> 调用 nodeStore action -> 构造 DataPatch -> pushCommand。
 * 视图协调（destroyViews、switchView 回退）收拢到此层和 history store。
 *
 * 交互层（composables/components）应通过此 composable 执行所有数据写操作，
 * 而非直接调用 nodeStore 的写 action。
 *
 * 例外：拖拽 mousemove 中的 nodeStore.moveNode（实时渲染，不入栈），
 * mouseup 时调 commitNodeMove 入栈。
 */
export function useCommands() {
  const nodeStore = useNodeStore()
  const project = useProjectStore()
  const history = useHistoryStore()

  // ── 历史控制 ──

  const canUndo: ComputedRef<boolean> = computed(() => history.canUndo)
  const canRedo: ComputedRef<boolean> = computed(() => history.canRedo)

  function undo(): void {
    history.undo()
  }

  function redo(): void {
    history.redo()
  }

  function clearHistory(): void {
    history.clear()
  }

  // ── 节点创建 ──

  /**
   * 创建节点（双击空白 / 工具栏添加 / Shift 连线起始节点等）。
   * 执行 addNode + 入栈 add 命令。返回新节点 ID。
   */
  function createNode(
    parentId: string,
    x: number,
    y: number,
    text?: string,
    options?: { id?: string },
  ): string {
    const id = nodeStore.addNode(parentId, x, y, text, options)
    const node = captureNodeFull(nodeStore, id)
    const patch: DataPatch = {
      nodeChanges: [{ type: 'add', id, new: node ?? undefined }],
      connChanges: [],
    }
    history.pushCommand(patch)
    return id
  }

  // ── 节点删除 ──

  /**
   * 删除节点（含各自子树）。
   * 内部完成：捕获子树 -> 执行删除 -> 视图协调 -> 入栈 remove 命令。
   */
  function deleteNodes(ids: string[]): void {
    if (ids.length === 0) return

    // 操作前捕获被删子树
    const subtree = captureSubtree(nodeStore, ids)

    // 执行删除 + 视图协调
    history.runWithViewCoord(() => {
      nodeStore.deleteNodes(ids)
    })

    // 入栈
    const patch: DataPatch = {
      nodeChanges: subtree.nodes.map((n) => ({
        type: 'remove' as const,
        id: n.id,
        old: deepClone(n),
      })),
      connChanges: subtree.connections.map((c) => ({
        type: 'remove' as const,
        parentId: c.parentId,
        connectionId: c.connection.id,
        connection: deepClone(c.connection),
      })),
    }
    history.pushCommand(patch)
  }

  // ── 节点移动（拖拽结束后入栈）──

  /**
   * 提交节点移动到历史栈。
   * 数据已在拖拽 mousemove 中通过 nodeStore.moveNode 改变，此处仅入栈。
   *
   * @param positions 每个节点的旧/新坐标
   */
  function commitNodeMove(
    positions: Array<{ id: string; oldX: number; oldY: number; newX: number; newY: number }>,
  ): void {
    if (positions.length === 0) return
    const patch: DataPatch = {
      nodeChanges: positions.map((p) => ({
        type: 'modify' as const,
        id: p.id,
        old: { x: p.oldX, y: p.oldY },
        new: { x: p.newX, y: p.newY },
      })),
      connChanges: [],
    }
    history.pushCommand(patch)
  }

  // ── 节点文本 ──

  /**
   * 设置节点文本（内联编辑器保存）。
   * 会触发 fitNodeToText，old/new 含 fit 后的尺寸。
   * coalesceKey 用于属性面板连续输入合并。
   */
  function setNodeText(nodeId: string, text: string): void {
    const oldFields = captureNodeFields(nodeStore, nodeId, ['text', 'width', 'height'])
    nodeStore.setNodeText(nodeId, text)
    const newFields = captureNodeFields(nodeStore, nodeId, ['text', 'width', 'height'])
    if (oldFields?.text === newFields?.text) return
    history.pushCommand(
      {
        nodeChanges: [
          {
            type: 'modify',
            id: nodeId,
            old: oldFields ?? undefined,
            new: newFields ?? undefined,
          },
        ],
        connChanges: [],
      },
      { coalesceKey: `text-${nodeId}` },
    )
  }

  /**
   * 更新节点文本（属性面板 / 侧边栏重命名）。
   * 与 setNodeText 类似但用 updateNodeText（不改编辑状态）。
   */
  function updateNodeText(nodeId: string, text: string): void {
    const oldFields = captureNodeFields(nodeStore, nodeId, ['text', 'width', 'height'])
    nodeStore.updateNodeText(nodeId, text)
    const newFields = captureNodeFields(nodeStore, nodeId, ['text', 'width', 'height'])
    history.pushCommand(
      {
        nodeChanges: [
          {
            type: 'modify',
            id: nodeId,
            old: oldFields ?? undefined,
            new: newFields ?? undefined,
          },
        ],
        connChanges: [],
      },
      { coalesceKey: `text-${nodeId}` },
    )
  }

  /** 批量更新选中节点文本 */
  function updateNodesText(ids: string[], text: string): void {
    if (ids.length === 0) return
    const oldFieldsList = ids.map((id) =>
      captureNodeFields(nodeStore, id, ['text', 'width', 'height']),
    )
    nodeStore.updateNodesText(ids, text)
    const newFieldsList = ids.map((id) =>
      captureNodeFields(nodeStore, id, ['text', 'width', 'height']),
    )
    const sortedKey = [...ids].sort().join(',')
    history.pushCommand(
      {
        nodeChanges: ids.map((id, i) => ({
          type: 'modify' as const,
          id,
          old: oldFieldsList[i] ?? undefined,
          new: newFieldsList[i] ?? undefined,
        })),
        connChanges: [],
      },
      { coalesceKey: `text-${sortedKey}` },
    )
  }

  // ── 节点样式 ──

  /**
   * 批量更新节点样式。
   * coalesceKey 按 id 集合合并连续编辑。
   */
  function updateNodesStyle(
    ids: string[],
    partial: { textColor?: string; backgroundColor?: string; borderColor?: string },
  ): void {
    if (ids.length === 0) return
    const oldStyles = ids.map((id) =>
      captureNodeFields(nodeStore, id, ['textColor', 'backgroundColor', 'borderColor']),
    )
    nodeStore.updateNodesStyle(ids, partial)
    const sortedKey = [...ids].sort().join(',')
    history.pushCommand(
      {
        nodeChanges: ids.map((id, i) => ({
          type: 'modify' as const,
          id,
          old: oldStyles[i] ?? undefined,
          new: { ...partial },
        })),
        connChanges: [],
      },
      { coalesceKey: `style-${sortedKey}` },
    )
  }

  // ── 节点 resize ──

  /**
   * 提交节点 resize 到历史栈。
   * 数据已在 onTransformEnd 中通过 nodeStore.resizeNode 改变，此处仅入栈。
   */
  function commitNodeResize(
    nodeId: string,
    oldState: { x: number; y: number; width: number; height: number },
    newState: { x: number; y: number; width: number; height: number },
  ): void {
    history.pushCommand({
      nodeChanges: [
        {
          type: 'modify',
          id: nodeId,
          old: { ...oldState },
          new: { ...newState },
        },
      ],
      connChanges: [],
    })
  }

  // ── reparent ──

  /** 修改节点父级（组合操作的一部分，也可单独使用） */
  function reparentNode(nodeId: string, newParentId: string): void {
    const oldFields = captureNodeFields(nodeStore, nodeId, ['parentId'])
    nodeStore.reparentNode(nodeId, newParentId)
    history.pushCommand({
      nodeChanges: [
        {
          type: 'modify',
          id: nodeId,
          old: oldFields ?? undefined,
          new: { parentId: newParentId },
        },
      ],
      connChanges: [],
    })
  }

  // ── 连线操作 ──

  /** 创建连线 */
  function addConnection(parentId: string, fromNodeId: string, toNodeId: string): void {
    nodeStore.addConnection(parentId, fromNodeId, toNodeId)
    // 捕获新创建的连线
    const conns = nodeStore.getConnections(parentId)
    const conn = conns.find(
      (c) => c.fromNodeId === fromNodeId && c.toNodeId === toNodeId,
    )
    if (conn) {
      history.pushCommand({
        nodeChanges: [],
        connChanges: [
          {
            type: 'add',
            parentId,
            connectionId: conn.id,
            connection: deepClone(conn),
          },
        ],
      })
    }
  }

  /** 删除连线 */
  function deleteConnections(parentId: string, connIds: string[]): void {
    if (connIds.length === 0) return
    const captured = captureConnections(nodeStore, parentId, connIds)
    nodeStore.deleteConnections(parentId, connIds)
    history.pushCommand({
      nodeChanges: [],
      connChanges: captured.map((c) => ({
        type: 'remove' as const,
        parentId: c.parentId,
        connectionId: c.connection.id,
        connection: deepClone(c.connection),
      })),
    })
  }

  /** 迁移连线（组合操作的一部分） */
  function moveConnections(
    fromParentId: string,
    toParentId: string,
    connIds: string[],
  ): void {
    if (connIds.length === 0) return
    const captured = captureConnections(nodeStore, fromParentId, connIds)
    nodeStore.moveConnections(fromParentId, toParentId, connIds)
    // 迁移 = 从原父节点删除 + 加到新父节点
    history.pushCommand({
      nodeChanges: [],
      connChanges: [
        ...captured.map((c) => ({
          type: 'remove' as const,
          parentId: c.parentId,
          connectionId: c.connection.id,
          connection: deepClone(c.connection),
        })),
        ...captured.map((c) => ({
          type: 'add' as const,
          parentId: toParentId,
          connectionId: c.connection.id,
          connection: deepClone(c.connection),
        })),
      ],
    })
  }

  /** 更新连线属性（coalesce 合并连续编辑） */
  function updateConnection(
    parentId: string,
    connectionId: string,
    partial: Partial<Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed'>>,
  ): void {
    const parent = nodeStore.getNode(parentId)
    const conn = parent?.connections.find((c) => c.id === connectionId)
    if (!conn) return
    const old: Partial<Connection> = {}
    for (const key of Object.keys(partial) as Array<keyof typeof partial>) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(old as any)[key] = deepClone((conn as any)[key])
    }
    nodeStore.updateConnection(parentId, connectionId, partial)
    history.pushCommand(
      {
        nodeChanges: [],
        connChanges: [
          {
            type: 'modify',
            parentId,
            connectionId,
            old,
            new: { ...partial },
          },
        ],
      },
      { coalesceKey: `conn-${connectionId}` },
    )
  }

  /** 批量更新连线样式（coalesce 合并） */
  function updateConnectionsStyle(
    parentId: string,
    connIds: string[],
    partial: {
      lineStyle?: LineStyle
      strokeWidth?: number
      strokeColor?: string
      directed?: boolean
    },
  ): void {
    if (connIds.length === 0) return
    const captured = captureConnections(nodeStore, parentId, connIds)
    nodeStore.updateConnectionsStyle(parentId, connIds, partial)
    const sortedKey = [...connIds].sort().join(',')
    history.pushCommand(
      {
        nodeChanges: [],
        connChanges: captured.map((c) => {
          const old: Partial<Connection> = {}
          for (const key of Object.keys(partial) as Array<keyof typeof partial>) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(old as any)[key] = deepClone((c.connection as any)[key])
          }
          return {
            type: 'modify' as const,
            parentId: c.parentId,
            connectionId: c.connection.id,
            old,
            new: { ...partial },
          }
        }),
      },
      { coalesceKey: `conn-style-${sortedKey}` },
    )
  }

  // ── 复合操作 ──

  /**
   * 组合选中节点。
   * 1. 计算包围盒中心
   * 2. 新建容器节点
   * 3. 迁移内部连线
   * 4. reparent 选中节点到容器
   * 5. 入栈复合命令
   *
   * @returns 容器节点 ID（失败返回 null）
   */
  function groupNodes(ids: string[]): string | null {
    if (ids.length < 2) return null

    const currentViewId = project.activeViewId

    // ── 捕获旧值 ──
    const oldParents = ids.map((id) => ({
      id,
      parentId: nodeStore.getNode(id)?.parentId ?? null,
    }))
    const idSet = new Set(ids)
    // 内部连线（两端均在选中集合）-- 迁移到容器
    const internalConns = nodeStore
      .getConnections(currentViewId)
      .filter((c) => idSet.has(c.fromNodeId) && idSet.has(c.toNodeId))
    const capturedInternalConns = internalConns.map((c) => deepClone(c))
    // 外部连线（仅一端在选中集合）-- reparent 后不再是同级关系，需删除
    const externalConns = nodeStore
      .getConnections(currentViewId)
      .filter(
        (c) =>
          (idSet.has(c.fromNodeId) || idSet.has(c.toNodeId)) &&
          !(idSet.has(c.fromNodeId) && idSet.has(c.toNodeId)),
      )
    const capturedExternalConns = externalConns.map((c) => deepClone(c))

    // ── 执行 ──
    // 计算包围盒中心
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const id of ids) {
      const n = nodeStore.getNode(id)
      if (!n) continue
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.width)
      maxY = Math.max(maxY, n.y + n.height)
    }
    const centerX = (minX + maxX) / 2 - DEFAULT_NODE_WIDTH / 2
    const centerY = (minY + maxY) / 2 - DEFAULT_NODE_HEIGHT / 2

    // 新建容器节点
    const containerId = nodeStore.addNode(currentViewId, centerX, centerY, '组合')
    const containerNode = captureNodeFull(nodeStore, containerId)

    // 迁移内部连线
    const internalConnIds = capturedInternalConns.map((c) => c.id)
    if (internalConnIds.length > 0) {
      nodeStore.moveConnections(currentViewId, containerId, internalConnIds)
    }

    // 删除外部连线（reparent 后选中节点不再是原视图直接子节点，外部连线失效）
    const externalConnIds = capturedExternalConns.map((c) => c.id)
    if (externalConnIds.length > 0) {
      nodeStore.deleteConnections(currentViewId, externalConnIds)
    }

    // reparent
    for (const id of ids) {
      nodeStore.reparentNode(id, containerId)
    }

    // ── 入栈复合命令 ──
    const nodeChanges: NodeChange[] = [
      { type: 'add', id: containerId, new: containerNode ?? undefined },
      ...ids.map((id, i) => ({
        type: 'modify' as const,
        id,
        old: { parentId: oldParents[i].parentId ?? undefined },
        new: { parentId: containerId },
      })),
    ]
    const connChanges: ConnectionChange[] = [
      // 内部连线：从原视图删除 + 加到容器
      ...capturedInternalConns.map((c) => ({
        type: 'remove' as const,
        parentId: currentViewId,
        connectionId: c.id,
        connection: deepClone(c),
      })),
      ...capturedInternalConns.map((c) => ({
        type: 'add' as const,
        parentId: containerId,
        connectionId: c.id,
        connection: deepClone(c),
      })),
      // 外部连线：从原视图删除
      ...capturedExternalConns.map((c) => ({
        type: 'remove' as const,
        parentId: currentViewId,
        connectionId: c.id,
        connection: deepClone(c),
      })),
    ]
    history.pushCommand({ nodeChanges, connChanges })

    return containerId
  }

  /**
   * 清空节点的所有子级（删除直接子节点及其子树，保留节点本身）。
   * 内部完成：捕获子树 -> 执行删除 -> 视图协调 -> 入栈。
   */
  function clearNodeChildren(nodeId: string): void {
    const children = nodeStore.childrenOf(nodeId)
    if (children.length === 0) return

    const childIds = children.map((c) => c.id)
    const subtree = captureSubtree(nodeStore, childIds)

    history.runWithViewCoord(() => {
      nodeStore.deleteNodes(childIds)
    })

    history.pushCommand({
      nodeChanges: subtree.nodes.map((n) => ({
        type: 'remove' as const,
        id: n.id,
        old: deepClone(n),
      })),
      connChanges: subtree.connections.map((c) => ({
        type: 'remove' as const,
        parentId: c.parentId,
        connectionId: c.connection.id,
        connection: deepClone(c.connection),
      })),
    })
  }

  // ── batch 事务（供交互层复合操作使用）──

  function beginBatch(): void {
    history.beginBatch()
  }
  function commitBatch(): void {
    history.commitBatch()
  }
  function rollbackBatch(): void {
    history.rollbackBatch()
  }

  return {
    // 历史控制
    canUndo,
    canRedo,
    undo,
    redo,
    clearHistory,
    // 节点
    createNode,
    deleteNodes,
    commitNodeMove,
    setNodeText,
    updateNodeText,
    updateNodesText,
    updateNodesStyle,
    commitNodeResize,
    reparentNode,
    // 连线
    addConnection,
    deleteConnections,
    moveConnections,
    updateConnection,
    updateConnectionsStyle,
    // 复合
    groupNodes,
    clearNodeChildren,
    // batch
    beginBatch,
    commitBatch,
    rollbackBatch,
  }
}
