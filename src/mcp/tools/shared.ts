/**
 * mcp/tools/shared.ts —— 各域 handler 共用的小工具（快照/引用解析/校验）。
 * 引用解析读 store（resolveNodeRef/resolveConnRef/预设名）；纯命名函数在 ../naming。
 * 解析失败只在 handler 入口抛一次 ToolError（含候选），不做"猜"，避免误写。
 */
import { ROOT_NODE_ID, useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { adapter } from '@/plugin/adapter'
import { assignNodeHandles, firstLineOf, normalizeHex, uniqueDisplayNames } from '../naming'
import type { Connection, WhiteboardNode } from '@/types'
import type { McpJsonSchema } from '../types'

export { firstLineOf }

/** handler 内快速失败：抛出的 Error 文本即工具返回的 isError 内容 */
export class ToolError extends Error {}

/** schema 快捷构造 */
export function schema(def: McpJsonSchema): McpJsonSchema {
  return def
}

/** 整数参数夹取（非法/越界回退默认） */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback
}

// ── 句柄与显示名 ──

/** 全局短句柄码表（id → 最短唯一前缀，不含 'N'）：每次调用按当前全量节点集计算（确定性） */
export function nodeHandles(): Map<string, string> {
  return assignNodeHandles([...useNodeStore().nodes.keys()])
}

/** 句柄 token（N + 码） */
export function handleToken(handles: Map<string, string>, id: string): string {
  return `N${handles.get(id) ?? id}`
}

/** 兄弟集（同父直接子节点）内的唯一显示名（同名追加 (2)/(3)，§5.3） */
export function siblingDisplayNames(children: readonly WhiteboardNode[]): Map<string, string> {
  const labels = new Map<string, string>()
  for (const c of children) labels.set(c.id, firstLineOf(c.text))
  return uniqueDisplayNames(labels)
}

/** 节点在其兄弟集内的唯一显示名（根节点自成一集） */
export function uniqueNameOf(n: WhiteboardNode): string {
  const store = useNodeStore()
  const siblings = n.parentId ? store.childrenOf(n.parentId) : [store.nodes.get(ROOT_NODE_ID)!].filter(Boolean)
  return siblingDisplayNames(siblings).get(n.id) ?? firstLineOf(n.text)
}

// ── 快照 ──

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

/** 节点结构化快照（T3 子级 / T2 json 共用形状）；x/y 序列化层取整，存储类型不动（D0-e） */
export interface NodeSnapshot {
  nodeId: string
  handle: string
  displayName: string
  firstLine: string
  x: number
  y: number
  childCount: number
}

export function nodeSnapshot(n: WhiteboardNode, ctx?: { handle?: string; displayName?: string }): NodeSnapshot {
  const store = useNodeStore()
  return {
    nodeId: n.id,
    handle: ctx?.handle ?? '',
    displayName: ctx?.displayName ?? firstLineOf(n.text),
    firstLine: firstLineOf(n.text),
    x: Math.round(n.x),
    y: Math.round(n.y),
    childCount: store.childrenOf(n.id).length,
  }
}

/** 连线结构化快照（T2/T3 共用形状；P0 补齐 4 个样式字段） */
export function connectionSnapshot(c: Connection): {
  id: string
  fromNodeId: string
  toNodeId: string
  directed: boolean
  lineStyle: string
  strokeWidth: number
  strokeColor: string
  text: string | null
} {
  return {
    id: c.id,
    fromNodeId: c.fromNodeId,
    toNodeId: c.toNodeId,
    directed: c.directed,
    lineStyle: c.lineStyle,
    strokeWidth: c.strokeWidth,
    strokeColor: c.strokeColor,
    text: c.text,
  }
}

// ── 引用解析（§5.4 五级） ──

interface Candidate {
  id: string
  handle: string
  name: string
}

/** 错误附 ≤5 个候选（带句柄） */
function candidatesNote(candidates: Candidate[]): string {
  const body = candidates
    .slice(0, 5)
    .map((c) => `N${c.handle} ${c.name || '(空)'}`)
    .join(', ')
  return body ? ` — candidates: ${body}` : ''
}

function candidateList(store: ReturnType<typeof useNodeStore>, handles: Map<string, string>, ids: string[]): Candidate[] {
  return ids.map((id) => {
    const n = store.getNode(id)
    return { id, handle: handles.get(id) ?? id, name: n ? firstLineOf(n.text) : '' }
  })
}

/** 全局显示名索引（兄弟集内消歧后的名字 → id 列表；跨视图同名仍可能多命中） */
function globalNameIndex(): Map<string, string[]> {
  const store = useNodeStore()
  const groups = new Map<string, WhiteboardNode[]>()
  for (const n of store.nodes.values()) {
    const key = n.parentId ?? '\u0000root'
    const arr = groups.get(key)
    if (arr) arr.push(n)
    else groups.set(key, [n])
  }
  const index = new Map<string, string[]>()
  for (const members of groups.values()) {
    for (const [id, name] of siblingDisplayNames(members)) {
      const arr = index.get(name)
      if (arr) arr.push(id)
      else index.set(name, [id])
    }
  }
  return index
}

/**
 * 节点引用解析（五级）：完整 id 精确 → N 句柄（≥3 位前缀，唯一才接受）→ 显示名精确（全局唯一）
 * → 唯一子串匹配 → 失败抛 ToolError。句柄语法优先于名字语法：N<code> 形状的 ref 只按 id 前缀解析。
 */
export function resolveNodeRef(ref: string): WhiteboardNode {
  const store = useNodeStore()
  const exact = store.getNode(ref)
  if (exact) return exact

  const handles = nodeHandles()
  function fail(msg: string, ids: string[]): never {
    throw new ToolError(`${msg}${candidatesNote(candidateList(store, handles, ids))}`)
  }

  // 句柄语法优先：N + ≥3 位码 → 只按 id 前缀解析，不回退名字
  const handleMatch = /^N([A-Za-z0-9_-]{3,})$/.exec(ref)
  if (handleMatch) {
    const code = handleMatch[1]
    const hits = [...store.nodes.keys()].filter((id) => id.startsWith(code))
    if (hits.length === 1) {
      const n = store.getNode(hits[0])
      if (n) return n
    }
    fail(hits.length === 0 ? `no node id starts with handle code "${code}"` : `ambiguous handle "${ref}" (${hits.length} matches)`, hits)
  }

  const nameIndex = globalNameIndex()
  const exactHits = nameIndex.get(ref) ?? []
  if (exactHits.length === 1) {
    const n = store.getNode(exactHits[0])
    if (n) return n
  }
  if (exactHits.length > 1) fail(`ambiguous display name "${ref}" (${exactHits.length} nodes)`, exactHits)

  const q = ref.toLowerCase()
  const subHits: string[] = []
  for (const [name, ids] of nameIndex) {
    if (name.toLowerCase().includes(q)) subHits.push(...ids)
    if (subHits.length > 1) break
  }
  if (subHits.length === 1) {
    const n = store.getNode(subHits[0])
    if (n) return n
  }
  if (subHits.length > 1) fail(`ambiguous node ref "${ref}" (${subHits.length} matches)`, subHits)
  fail(`node ref not found: "${ref}" (use a handle N<code>, exact name, or full id)`, [])
}

/**
 * 连线引用解析（D6）：完整 connectionId → "Nfrom>Nto"（端点走 resolveNodeRef，接受双向写法）
 * → "C<n>"（当前视图父连线表 1-based 下标；删除前序连线后需重新读取）。
 */
export function resolveConnRef(ref: string): { parentId: string; connection: Connection } {
  const store = useNodeStore()
  const byId = store.findConnectionById(ref)
  if (byId) return byId

  const pairMatch = /^(.+)>(.+)$/.exec(ref)
  if (pairMatch) {
    const from = resolveNodeRef(pairMatch[1].trim())
    const to = resolveNodeRef(pairMatch[2].trim())
    if (from.parentId !== to.parentId || from.parentId === null) {
      throw new ToolError(`connection endpoints must be siblings: "${pairMatch[1]}" and "${pairMatch[2]}"`)
    }
    const parentId = from.parentId
    const hits = store
      .getConnections(parentId)
      .filter(
        (c) =>
          (c.fromNodeId === from.id && c.toNodeId === to.id) || (c.fromNodeId === to.id && c.toNodeId === from.id),
      )
    if (hits.length === 1) return { parentId, connection: hits[0] }
    if (hits.length > 1) throw new ToolError(`ambiguous connection between the two endpoints (${hits.length} parallel edges) — use C<n> or the full connection id`)
    throw new ToolError(`no connection between "${pairMatch[1]}" and "${pairMatch[2]}" in their common view`)
  }

  const idxMatch = /^C(\d+)$/.exec(ref)
  if (idxMatch) {
    const parentId = useProjectStore().currentNodeId
    const conns = store.getConnections(parentId)
    const idx = Number(idxMatch[1])
    const conn = conns[idx - 1]
    if (conn) return { parentId, connection: conn }
    throw new ToolError(
      `connection ref "${ref}" not found — current view has ${conns.length} connection(s); C<n> is the 1-based index into the CURRENT view's connection list, or use "Nfrom>Nto" / full id`,
    )
  }

  throw new ToolError(`connection ref not found: "${ref}" (use C<n>, "Nfrom>Nto", or the full connection id)`)
}

// ── 预设名解析（D3 正反向） ──

/** 节点样式入参：'#hex' 原样；否则按预设名查 borderColor，未命中抛 ToolError 附候选 */
export function resolvePresetColor(value: string): string {
  if (value.startsWith('#')) return value
  const presets = adapter.api.presets.nodePresets()
  const hit = presets.find((p) => p.name === value)
  if (hit) return hit.borderColor
  const names = presets.slice(0, 5).map((p) => p.name).join(', ')
  throw new ToolError(`unknown node preset "${value}" — use a preset name or hex; available: ${names}${presets.length > 5 ? ' …' : ''}`)
}

export interface ConnectionPresetPatch {
  lineStyle: 'solid' | 'dashed' | 'dotted'
  strokeWidth: number
  strokeColor: string
  directed: boolean
}

/** 连线预设名 → 样式补丁，未命中抛 ToolError 附候选 */
export function resolveConnectionPreset(name: string): ConnectionPresetPatch {
  const presets = adapter.api.presets.connectionPresets()
  const hit = presets.find((p) => p.name === name)
  if (!hit) {
    const names = presets.slice(0, 5).map((p) => p.name).join(', ')
    throw new ToolError(`unknown connection preset "${name}" — available: ${names}${presets.length > 5 ? ' …' : ''}`)
  }
  return { lineStyle: hit.lineStyle, strokeWidth: hit.strokeWidth, strokeColor: hit.strokeColor, directed: hit.directed }
}

/** 取节点或抛 ToolError（原始 id；引用解析入口请用 resolveNodeRef） */
export function requireNode(nodeId: string): WhiteboardNode {
  const n = useNodeStore().getNode(nodeId)
  if (!n) throw new ToolError(`node not found: ${nodeId}`)
  return n
}
