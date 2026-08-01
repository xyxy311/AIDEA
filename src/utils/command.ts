import { toRaw } from 'vue'
import type { WhiteboardNode, Connection } from '@/types'
import type { useNodeStore } from '@/stores/node'

// ===== 命令数据结构 =====

/** 节点变更（add/remove/modify） */
export interface NodeChange {
  type: 'add' | 'remove' | 'modify'
  id: string
  /** remove: 完整节点深拷贝; modify: 仅变化字段 */
  old?: Partial<WhiteboardNode>
  /** add: 完整节点深拷贝; modify: 仅变化字段 */
  new?: Partial<WhiteboardNode>
}

/** 连线变更（嵌套在父节点 connections 数组中） */
export interface ConnectionChange {
  type: 'add' | 'remove' | 'modify'
  parentId: string
  connectionId: string
  /** add/remove: 完整连线深拷贝 */
  connection?: Connection
  /** modify: 旧值（仅变化字段） */
  old?: Partial<Connection>
  /** modify: 新值（仅变化字段） */
  new?: Partial<Connection>
}

/** 统一命令：一组节点变更 + 一组连线变更 */
export interface DataPatch {
  nodeChanges: NodeChange[]
  connChanges: ConnectionChange[]
}

/** 历史栈条目 */
export interface HistoryEntry {
  patch: DataPatch
  coalesceKey?: string
  timestamp: number
}

// ===== 纯辅助函数 =====

/**
 * 深拷贝（穿透 Vue reactive 代理）。
 * 项目数据均为 JSON 可序列化的 plain data，用 JSON 方式安全可靠。
 *
 * 注意：undefined / null 直接返回（JSON.stringify(undefined) 返回 undefined
 * 而非字符串，JSON.parse(undefined) 会抛 SyntaxError）。
 */
export function deepClone<T>(obj: T): T {
  if (obj === undefined || obj === null) return obj
  return JSON.parse(JSON.stringify(toRaw(obj)))
}

/**
 * 捕获节点指定字段的当前值（用于 modify 命令的 old）。
 * fields 指定要捕获的属性名。
 */
export function captureNodeFields(
  nodeStore: ReturnType<typeof useNodeStore>,
  id: string,
  fields: Array<keyof WhiteboardNode>,
): Partial<WhiteboardNode> | null {
  const node = nodeStore.getNode(id)
  if (!node) return null
  const result: Partial<WhiteboardNode> = {}
  for (const f of fields) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result[f] = deepClone((node as any)[f])
  }
  return result
}

/**
 * 捕获完整节点（深拷贝，含 connections 数组）。
 * 用于 add/remove 命令。
 */
export function captureNodeFull(
  nodeStore: ReturnType<typeof useNodeStore>,
  id: string,
): WhiteboardNode | null {
  const node = nodeStore.getNode(id)
  if (!node) return null
  return deepClone(node)
}

/**
 * 捕获子树：递归收集所有后代节点（深拷贝）+ 被清理的父级连线。
 *
 * 删除节点时，nodeStore.deleteNode 会：
 * 1. 递归删除子节点
 * 2. 从父节点 connections 清除涉及该节点的连线
 *
 * 因此需要收集：
 * - 子树中所有节点（含各自的 connections 数组，随节点深拷贝）
 * - 被删节点的父节点中，涉及被删节点的连线（会被 deleteNode 清理）
 *
 * @returns nodes: 被删节点深拷贝列表; connections: 被清理的父级连线; removedIds: 所有被删节点 id
 */
export function captureSubtree(
  nodeStore: ReturnType<typeof useNodeStore>,
  ids: string[],
): {
  nodes: WhiteboardNode[]
  connections: Array<{ parentId: string; connection: Connection }>
  removedIds: string[]
} {
  const nodes: WhiteboardNode[] = []
  const removedIds = new Set<string>()
  const connections: Array<{ parentId: string; connection: Connection }> = []
  const capturedConnKeys = new Set<string>()

  // 收集子树所有节点
  const stack = [...ids]
  while (stack.length) {
    const id = stack.pop()!
    if (removedIds.has(id)) continue
    removedIds.add(id)
    const node = nodeStore.getNode(id)
    if (!node) continue
    nodes.push(deepClone(node))
    for (const child of nodeStore.childrenOf(id)) {
      stack.push(child.id)
    }
  }

  // 收集被删节点的父节点中，涉及被删节点的连线
  for (const id of removedIds) {
    const node = nodeStore.getNode(id)
    if (!node?.parentId) continue
    const parent = nodeStore.getNode(node.parentId)
    if (!parent) continue
    for (const conn of parent.connections) {
      if (removedIds.has(conn.fromNodeId) || removedIds.has(conn.toNodeId)) {
        const key = `${node.parentId}:${conn.id}`
        if (!capturedConnKeys.has(key)) {
          capturedConnKeys.add(key)
          connections.push({ parentId: node.parentId, connection: deepClone(conn) })
        }
      }
    }
  }

  return { nodes, connections, removedIds: [...removedIds] }
}

/**
 * 捕获指定父节点中的连线（深拷贝）。
 * 用于连线删除/迁移命令的 old。
 */
export function captureConnections(
  nodeStore: ReturnType<typeof useNodeStore>,
  parentId: string,
  connIds: string[],
): Array<{ parentId: string; connection: Connection }> {
  const result: Array<{ parentId: string; connection: Connection }> = []
  const idSet = new Set(connIds)
  for (const conn of nodeStore.getConnections(parentId)) {
    if (idSet.has(conn.id)) {
      result.push({ parentId, connection: deepClone(conn) })
    }
  }
  return result
}
