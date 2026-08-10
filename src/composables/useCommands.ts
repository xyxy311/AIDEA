import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'
import type { Connection, LineStyle, WhiteboardNode } from '@/types'
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
import { extractReferenceName } from '@/utils/reference'
import { snapPosition, snapSize } from '@/utils/grid'

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
    opts?: { coalesceKey?: string },
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
    history.pushCommand(patch, opts)
  }

  /**
   * 网格对齐：将指定节点对齐到网格约束（网格模式开启时的批量吸附）。
   *
   * 对齐规则（与 utils/grid 一致）：
   * 1. 先 fitNodeToText（文本自适应，可能撑大尺寸）
   * 2. 尺寸向上取整百（snapSize）
   * 3. 位置四舍五入（snapPosition）
   *
   * 捕获修改前后（x/y/width/height）为 modify patch，多节点合并为单条历史
   * （一个 DataPatch 含若干 modify，无需 beginBatch）。
   * 若某节点修改后无变化（本就对齐且文本未撑大）则跳过该 modify，避免污染历史。
   */
  function alignNodesToGrid(ids: string[]): void {
    // 先捕获旧值（runWithViewCoord 执行前仍需读取节点）
    const olds = new Map<string, Partial<WhiteboardNode>>()
    for (const id of ids) {
      const node = nodeStore.getNode(id)
      if (!node) continue
      olds.set(id, captureNodeFields(nodeStore, id, ['x', 'y', 'width', 'height']) ?? {})
    }
    if (olds.size === 0) return

    // 构造 patch（nodeChanges 在包裹的执行内逐步填充；connChanges 恒为空）
    const patch: DataPatch = { nodeChanges: [], connChanges: [] }

    // 包裹视图协调：fit+snap+写节点，并传入 patch，
    // 使 runWithViewCoord 据 patch 推导 sizeModifiedIds 同步内联视图宿主尺寸。
    history.runWithViewCoord(() => {
      for (const id of olds.keys()) {
        nodeStore.fitNodeToText(id)
        const n = nodeStore.getNode(id)!
        const neu = {
          x: snapPosition(n.x),
          y: snapPosition(n.y),
          width: snapSize(n.width),
          height: snapSize(n.height),
        }
        nodeStore.setNodeSize(id, neu.x, neu.y, neu.width, neu.height)
        const old = olds.get(id)!
        if (
          old.x !== neu.x ||
          old.y !== neu.y ||
          old.width !== neu.width ||
          old.height !== neu.height
        ) {
          patch.nodeChanges.push({ type: 'modify', id, old, new: neu })
        }
      }
    }, patch)

    if (patch.nodeChanges.length > 0) {
      history.pushCommand(patch)
    }
  }

  // ── 节点文本 ──

  /**
   * 设置节点文本。
   * 会触发 fitNodeToText，old/new 含 fit 后的尺寸。
   * coalesceKey 用于属性面板连续输入合并。
   *
   * 重名校验：若新文本以 `#` 开头且引用名已被其他节点占用，则不执行写入、不入栈，
   * 返回 `{ ok: false, conflictRef }`。否则正常执行并入栈，返回 `{ ok: true }`。
   *
   * @returns 是否成功；失败时携带冲突的引用名
   */
  function setNodeText(nodeId: string, text: string): { ok: boolean; conflictRef?: string } {
    const refName = extractReferenceName(text)
    if (refName && nodeStore.isReferenceNameTaken(refName, nodeId)) {
      return { ok: false, conflictRef: refName }
    }
    const oldFields = captureNodeFields(nodeStore, nodeId, ['text', 'width', 'height'])
    nodeStore.setNodeText(nodeId, text)
    const newFields = captureNodeFields(nodeStore, nodeId, ['text', 'width', 'height'])
    if (oldFields?.text === newFields?.text) return { ok: true }
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
    return { ok: true }
  }

  /**
   * 批量更新选中节点文本。
   *
   * 重名校验：若新文本以 `#` 开头且 ids 多于 1 个，则这些节点彼此重名，视为冲突整批失败；
   * 若 ids 仅 1 个，则校验该节点是否与已有引用重名（排除自身）。
   * 任一冲突都不执行写入、不入栈，返回 `{ ok: false, conflictRef }`。
   *
   * @returns 是否成功；失败时携带冲突的引用名
   */
  function setNodesText(ids: string[], text: string): { ok: boolean; conflictRef?: string } {
    if (ids.length === 0) return { ok: true }
    const refName = extractReferenceName(text)
    if (refName) {
      if (ids.length > 1) {
        return { ok: false, conflictRef: refName }
      }
      if (nodeStore.isReferenceNameTaken(refName, ids[0])) {
        return { ok: false, conflictRef: refName }
      }
    }
    const oldFieldsList = ids.map((id) =>
      captureNodeFields(nodeStore, id, ['text', 'width', 'height']),
    )
    nodeStore.setNodesText(ids, text)
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
    return { ok: true }
  }

  // ── 节点样式 ──

  /**
   * 批量更新节点样式。
   * coalesceKey 按 id 集合合并连续编辑。
   */
  function updateNodesStyle(
    ids: string[],
    partial: { borderColor?: string },
  ): void {
    if (ids.length === 0) return
    const oldStyles = ids.map((id) =>
      captureNodeFields(nodeStore, id, ['borderColor']),
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

  // ── 节点标签 ──

  /**
   * 按节点分别设置标签（modify 每个节点各自的 tagIds，可撤销；支持多选）。
   * tagIdsPerNode 与 ids 等长，逐节点整体替换为该节点自己的标签集合。
   * coalesceKey 按 id 集合合并连续编辑。
   */
  function updateNodesTagsPerNode(ids: string[], tagIdsPerNode: string[][]): void {
    if (ids.length === 0) return
    const oldTags = ids.map((id) => captureNodeFields(nodeStore, id, ['tagIds']))
    nodeStore.updateNodesTagsPerNode(ids, tagIdsPerNode)
    const sortedKey = [...ids].sort().join(',')
    history.pushCommand(
      {
        nodeChanges: ids.map((id, i) => ({
          type: 'modify' as const,
          id,
          old: oldTags[i] ?? undefined,
          new: { tagIds: [...(tagIdsPerNode[i] ?? [])] },
        })),
        connChanges: [],
      },
      { coalesceKey: `tags-${sortedKey}` },
    )
  }

  /** 给所有目标节点设置同一组标签（整体替换） */
  function updateSelectedNodesTags(ids: string[], tagIds: string[]): void {
    updateNodesTagsPerNode(ids, ids.map(() => tagIds))
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

  /**
   * 跨视图 reparent 节点（拖拽到内联视图 / 拖回主视图）。
   *
   * 1. 迁移内部连线（两端均在迁移集合）到目标父级
   * 2. 删除外部连线（仅一端在迁移集合）—— reparent 后不再是同级关系
   * 3. reparent 每个节点到 targetParentId 并设置新位置
   * 4. 入栈复合 DataPatch（parentId + x/y 修改 + 连线 remove/add）
   *
   * @param nodeIds       要迁移的节点 ID（跨视图选中时可能来自不同父级）
   * @param targetParentId 新父级节点 ID
   * @param newPositions   每个节点在新视图中的落点 { x, y }
   */
  function reparentTo(
    nodeIds: string[],
    targetParentId: string,
    newPositions: Map<string, { x: number; y: number }>,
  ): void {
    // ── 1. 过滤无效节点 ──
    const validIds = nodeIds.filter((id) => {
      if (id === ROOT_NODE_ID) return false
      const node = nodeStore.getNode(id)
      if (!node) return false
      if (node.parentId === targetParentId) return false
      return true
    })
    if (validIds.length === 0) return

    // ── 2. 防环校验：targetParentId 不能是节点自身或其后代 ──
    const filteredIds = validIds.filter((id) => {
      const descendants = nodeStore.descendantsOf(id)
      return !descendants.includes(targetParentId)
    })
    if (filteredIds.length === 0) return

    // ── 3. 捕获旧值 ──
    const oldValues = filteredIds.map((id) => {
      const node = nodeStore.getNode(id)!
      return { id, oldParentId: node.parentId, oldX: node.x, oldY: node.y }
    })

    // ── 4. 收集内外连线（内部随迁到目标父级、外部删除）──
    const { internal: capturedInternalConns, external: capturedExternalConns } =
      nodeStore.collectNodeConnections(filteredIds)

    // ── 5. 执行 ──（包裹视图协调：reparent 后宿主节点可能离开主视图层级，需清理内联视图）
    history.runWithViewCoord(() => {
      // 迁移内部连线到目标父级
      nodeStore.migrateConnectionsToParent(capturedInternalConns, targetParentId)
      // 删除外部连线
      nodeStore.removeConnectionsBySource(capturedExternalConns)
      // reparent + 位置更新
      for (const id of filteredIds) {
        nodeStore.reparentNode(id, targetParentId)
        const p = newPositions.get(id)
        if (p) {
          nodeStore.moveNode(id, p.x, p.y)
        }
      }
    })

    // ── 7. 构造 DataPatch ──
    const nodeChanges: NodeChange[] = filteredIds.map((id) => {
      const old = oldValues.find((o) => o.id === id)!
      const p = newPositions.get(id)
      return {
        type: 'modify',
        id,
        old: { parentId: old.oldParentId ?? undefined, x: old.oldX, y: old.oldY },
        new: {
          parentId: targetParentId,
          x: p ? p.x : old.oldX,
          y: p ? p.y : old.oldY,
        },
      }
    })
    const connChanges: ConnectionChange[] = [
      // 内部连线：从来源父级删除 + 加到目标父级
      ...capturedInternalConns.map((item) => ({
        type: 'remove' as const,
        parentId: item.sourceParentId,
        connectionId: item.conn.id,
        connection: deepClone(item.conn),
      })),
      ...capturedInternalConns.map((item) => ({
        type: 'add' as const,
        parentId: targetParentId,
        connectionId: item.conn.id,
        connection: deepClone(item.conn),
      })),
      // 外部连线：从来源父级删除
      ...capturedExternalConns.map((item) => ({
        type: 'remove' as const,
        parentId: item.sourceParentId,
        connectionId: item.conn.id,
        connection: deepClone(item.conn),
      })),
    ]
    history.pushCommand({ nodeChanges, connChanges })
  }

  // ── 连线操作 ──

  /** 创建连线 */
  function addConnection(parentId: string, fromNodeId: string, toNodeId: string): string | null {
    const connId = nodeStore.addConnection(parentId, fromNodeId, toNodeId)
    // 捕获新创建的连线
    const conns = nodeStore.getConnections(parentId)
    const conn = conns.find(
      (c) => c.id === connId,
    )
    if (!conn) 
      return null
    
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
    return connId
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
    partial: Partial<Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed' | 'text'>>,
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
      text?: string | null
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

  /**
   * 批量更新连线样式（按连线 ID 全局查找，支持跨视图多父级）。
   * 跨视图选中时，选中连线可能来自主视图或任一内联视图宿主节点，
   * 此方法按 ID 全局查找每条连线所属父级，分组更新，合并为单条历史。
   * coalesce 合并用同一 key（按 id 集合）。
   */
  function updateConnectionsStyleByIds(
    connIds: string[],
    partial: {
      lineStyle?: LineStyle
      strokeWidth?: number
      strokeColor?: string
      directed?: boolean
      text?: string | null
    },
  ): void {
    if (connIds.length === 0) return
    // 按父级分组
    const byParent = new Map<string, string[]>()
    for (const connId of connIds) {
      const found = nodeStore.findConnectionById(connId)
      if (!found) continue
      let arr = byParent.get(found.parentId)
      if (!arr) {
        arr = []
        byParent.set(found.parentId, arr)
      }
      arr.push(connId)
    }
    // 捕获旧值 + 执行 + 构造 DataPatch
    const connChanges: ConnectionChange[] = []
    byParent.forEach((ids, parentId) => {
      const captured = captureConnections(nodeStore, parentId, ids)
      nodeStore.updateConnectionsStyle(parentId, ids, partial)
      for (const c of captured) {
        const old: Partial<Connection> = {}
        for (const key of Object.keys(partial) as Array<keyof typeof partial>) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(old as any)[key] = deepClone((c.connection as any)[key])
        }
        connChanges.push({
          type: 'modify',
          parentId: c.parentId,
          connectionId: c.connection.id,
          old,
          new: { ...partial },
        })
      }
    })
    const sortedKey = [...connIds].sort().join(',')
    history.pushCommand(
      { nodeChanges: [], connChanges },
      { coalesceKey: `conn-style-${sortedKey}` },
    )
  }

  /**
   * 删除连线（按连线 ID 全局查找，支持跨视图多父级）。
   * 跨视图选中时，选中连线可能来自主视图或任一内联视图宿主节点，
   * 此方法按 ID 全局查找每条连线所属父级，分组删除，合并为单条历史。
   */
  function deleteConnectionsByIds(connIds: string[]): void {
    if (connIds.length === 0) return
    // 按父级分组
    const byParent = new Map<string, string[]>()
    for (const connId of connIds) {
      const found = nodeStore.findConnectionById(connId)
      if (!found) continue
      let arr = byParent.get(found.parentId)
      if (!arr) {
        arr = []
        byParent.set(found.parentId, arr)
      }
      arr.push(connId)
    }
    // 捕获旧值 + 执行 + 构造 DataPatch
    const connChanges: ConnectionChange[] = []
    byParent.forEach((ids, parentId) => {
      const captured = captureConnections(nodeStore, parentId, ids)
      nodeStore.deleteConnections(parentId, ids)
      for (const c of captured) {
        connChanges.push({
          type: 'remove' as const,
          parentId: c.parentId,
          connectionId: c.connection.id,
          connection: deepClone(c.connection),
        })
      }
    })
    history.pushCommand({ nodeChanges: [], connChanges })
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

    const currentViewId = project.currentNodeId

    // ── 计算包围盒中心 ──
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

    // ── 新建容器节点（放主视图当前层级）──
    const containerId = nodeStore.addNode(currentViewId, centerX, centerY, '组合')
    const containerNode = captureNodeFull(nodeStore, containerId)

    // ── 组合 ≈ 新建容器节点 + reparentTo 到容器（batch 合并为单条历史）──
    history.beginBatch()
    try {
      history.pushCommand({
        nodeChanges: [
          { type: 'add', id: containerId, new: containerNode ?? undefined },
        ],
        connChanges: [],
      })
      // reparentTo 内部完成：迁移内部连线 / 删除外部连线 / reparent 全部选中节点。
      // 传空 newPositions，节点在原位成为容器的子级。
      reparentTo(ids, containerId, new Map())
    } finally {
      history.commitBatch()
    }

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
    alignNodesToGrid,
    setNodeText,
    setNodesText,
    updateNodesStyle,
    updateSelectedNodesTags,
    updateNodesTagsPerNode,
    commitNodeResize,
    reparentTo,
    // 连线
    addConnection,
    deleteConnections,
    moveConnections,
    updateConnection,
    updateConnectionsStyle,
    updateConnectionsStyleByIds,
    deleteConnectionsByIds,
    // 复合
    groupNodes,
    clearNodeChildren,
    // batch
    beginBatch,
    commitBatch,
    rollbackBatch,
  }
}
