// 命令层数据结构与捕获函数：定义节点/连线/插件扩展数据变更补丁类型，
// 以及撤销栈所需的深拷贝与旧值捕获。
import { toRaw } from 'vue'
import type { WhiteboardNode, Connection } from '@/types'
import type { useNodeStore } from '@/stores/node'

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

/** 插件项目级扩展数据变更：键为 `${pluginId}:${key}`，undo/redo 直接按 old/new 恢复。 */
export interface AdditionChange {
  type: 'set' | 'remove'
  key: string
  /** 操作前的旧值（键原本不存在时为 undefined） */
  old?: unknown
  /** set 的新值（remove 不携带） */
  new?: unknown
}

/** 统一命令：一组节点变更 + 一组连线变更（+ 可选的插件 additions 变更） */
export interface DataPatch {
  nodeChanges: NodeChange[]
  connChanges: ConnectionChange[]
  /** 插件项目级扩展数据变更（可选：多数命令不含） */
  additionsChanges?: AdditionChange[]
}

/** 历史栈条目 */
export interface HistoryEntry {
  patch: DataPatch
  coalesceKey?: string
  timestamp: number
}

/**
 * 深拷贝（穿透 Vue reactive 代理）：项目数据为 JSON plain data；
 * undefined/null 直接返回（JSON.stringify(undefined) 返回 undefined，JSON.parse 会抛错）。
 */
export function deepClone<T>(obj: T): T {
  if (obj === undefined || obj === null) return obj
  return JSON.parse(JSON.stringify(toRaw(obj)))
}

/** 捕获节点指定字段的当前值（供 modify 命令的 old）。 */
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

/** 捕获完整节点深拷贝（含 connections 数组，供 add/remove 命令）。 */
export function captureNodeFull(
  nodeStore: ReturnType<typeof useNodeStore>,
  id: string,
): WhiteboardNode | null {
  const node = nodeStore.getNode(id)
  if (!node) return null
  return deepClone(node)
}

/**
 * 捕获被删子树（节点深拷贝）+ 被清理的父级连线。
 * deleteNode 会递归删除子节点并从父 connections 清理相关连线，故需一并收集供 undo。
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

/** 捕获指定父节点中的连线深拷贝（供连线删除/迁移命令的 old）。 */
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
