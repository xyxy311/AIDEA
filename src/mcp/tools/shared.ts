/**
 * mcp/tools/shared.ts —— 各域 handler 共用的小工具（快照/路径/校验），不承担业务。
 */
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import type { WhiteboardNode } from '@/types'
import type { McpJsonSchema } from '../types'

/** 取节点文本首行（trim；空文本 → ''） */
export function firstLineOf(text: string): string {
  return (text.split('\n')[0] ?? '').trim()
}

/** 节点结构化快照（T2/T3/T4 共用形状） */
export interface NodeSnapshot {
  nodeId: string
  firstLine: string
  x: number
  y: number
  width: number
  height: number
  childCount: number
}

export function nodeSnapshot(n: WhiteboardNode): NodeSnapshot {
  const store = useNodeStore()
  return {
    nodeId: n.id,
    firstLine: firstLineOf(n.text),
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
    childCount: store.childrenOf(n.id).length,
  }
}

/** 节点的祖先链路径（含项目名，不含自身）：'/Project/Parent' */
export function ancestorPath(nodeId: string): string {
  const store = useNodeStore()
  const chain = store.pathToRoot(nodeId).slice(1).reverse()
  return '/' + chain.map((id) => firstLineOf(store.getNode(id)?.text ?? '')).join('/')
}

/** 视图节点的标题路径（祖先链 + 自身首行）：'/Project/Node' */
export function titlePathOf(nodeId: string): string {
  const store = useNodeStore()
  const chain = store.pathToRoot(nodeId).reverse()
  return '/' + chain.map((id) => firstLineOf(store.getNode(id)?.text ?? '')).join('/')
}

/** handler 内快速失败：抛出的 Error 文本即工具返回的 isError 内容 */
export class ToolError extends Error {}

/** 取节点或抛 ToolError */
export function requireNode(nodeId: string): WhiteboardNode {
  const n = useNodeStore().getNode(nodeId)
  if (!n) throw new ToolError(`node not found: ${nodeId}`)
  return n
}

/** schema 快捷构造 */
export function schema(def: McpJsonSchema): McpJsonSchema {
  return def
}
