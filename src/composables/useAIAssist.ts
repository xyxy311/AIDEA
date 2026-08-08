/**
 * AI 补全 - 上下文解析
 *
 * 把"节点树 + 连线"转换为结构化语言描述，供 AI 模型作为上下文输入。
 * 只读 nodeStore，不触碰任何写路径（不写数据 / 不进历史栈）。
 *
 * 输出结构（对齐 docs/my-plan.md）：
 *
 *   # [项目名]
 *
 *   # 设定
 *   # 被引用节点1
 *       其子节点
 *           ...
 *   # 被引用节点2
 *       ...
 *
 *   ## 节点树
 *   根节点
 *       祖先1
 *           目标节点 (N1)
 *               子节点1 (C1)
 *               子节点2 (C2)
 *
 *   ## 连线表（起点ID -> 终点ID）
 *   C1 --[连线文字]--> C2
 *
 * 规则：
 * - 节点树 = 从根到目标节点的路径（缩进表示层级），到目标节点时把其所有
 *   直接子节点追加到下一层级。
 * - 节点 ID：从目标节点开始分配（目标 = N1，其直接子节点 = C1..Cn）。
 *   仅当 options.includeIds 为 true 才输出；连线表依赖 ID，故
 *   includeConnections 仅在 includeIds=true 时生效。
 * - # 设定：收集节点树部分（根→目标及目标子集）文本中出现的 @引用，
 *   解析到被引用的可引用节点（# 起始），递归输出其完整子树（无限深度）。
 */
import type { WhiteboardNode } from '@/types'
import type { useNodeStore } from '@/stores/node'
import { parseReferenceSegments } from '@/utils/reference'

type NodeStore = ReturnType<typeof useNodeStore>

/** 构建上下文的控制选项 */
export interface BuildContextOptions {
  /** 是否从目标节点开始生成节点 ID（目标=N1，子=C1..Cn）。默认 true */
  includeIds?: boolean
  /** 是否生成连线表。默认 true；依赖 includeIds=true 才有效 */
  includeConnections?: boolean
}

/** 定义某层缩进单位（两个空格） */
const INDENT = '  '

/** 取节点文本的首行（去掉前导/尾随空白），作为单行描述 */
function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? ''
  return line.trim()
}

/**
 * 递归收集某个节点子树文本中出现的所有引用名（去重，保留首次出现顺序）。
 * 用于 # 设定 区块：收集节点树部分出现的 @引用。
 */
function collectRefNames(
  nodeStore: NodeStore,
  node: WhiteboardNode,
  seen: Set<string>,
  out: string[],
): void {
  for (const para of parseReferenceSegments(node.text)) {
    for (const seg of para) {
      if (seg.type === 'ref' && seg.refName && !seen.has(seg.refName)) {
        seen.add(seg.refName)
        out.push(seg.refName)
      }
    }
  }
}

/**
 * 递归输出被引用节点的完整子树（# 设定 部分）。
 * @param depth 当前缩进层级（顶层被引用节点为 0）
 */
function appendRefSubtree(
  nodeStore: NodeStore,
  nodeId: string,
  depth: number,
  lines: string[],
): void {
  for (const child of nodeStore.childrenOf(nodeId)) {
    lines.push(INDENT.repeat(depth) + firstLine(child.text))
    appendRefSubtree(nodeStore, child.id, depth + 1, lines)
  }
}

/**
 * 构建当前视图的结构化语言描述。
 *
 * @param nodeStore    - 节点 store 实例（只读）
 * @param targetNodeId - 目标节点 ID（从根到它的路径 + 其子级进入上下文）
 * @param options      - 控制是否生成节点 ID 与连线表
 * @returns 结构化语言描述字符串
 */
export function buildNodeContext(
  nodeStore: NodeStore,
  targetNodeId: string,
  options: BuildContextOptions = {},
): string {
  const { includeIds = true, includeConnections = true } = options
  const root = nodeStore.rootNode
  const target = nodeStore.getNode(targetNodeId)
  if (!root || !target) return ''

  const lines: string[] = []

  // ── 标题：项目名 ──
  lines.push(`# ${firstLine(root.text)}`)

  // ── 节点树部分：根→目标路径 + 目标直接子级 ──
  const pathIds = nodeStore.pathToRoot(targetNodeId).reverse() // 根→目标
  const targetChildren = nodeStore.childrenOf(targetNodeId)

  // ── # 设定：收集节点树部分出现的 @引用 ──
  const refNames: string[] = []
  const seenRefs = new Set<string>()
  lines.push('', '# 设定')
  for (const id of pathIds) {
    const n = nodeStore.getNode(id)
    if (n) collectRefNames(nodeStore, n, seenRefs, refNames)
  }
  for (const child of targetChildren) {
    collectRefNames(nodeStore, child, seenRefs, refNames)
  }
  for (const name of refNames) {
    const refNodeId = nodeStore.getReferenceNodeId(name)
    if (!refNodeId) continue
    const refNode = nodeStore.getNode(refNodeId)
    if (!refNode) continue
    lines.push(name.startsWith('#') ? name : `#${name}`)
    appendRefSubtree(nodeStore, refNode.id, 1, lines)
  }

  // ── ## 节点树 ──
  lines.push('', '## 节点树')
  for (let i = 0; i < pathIds.length; i++) {
    const n = nodeStore.getNode(pathIds[i])
    if (!n) continue
    const isTarget = pathIds[i] === targetNodeId
    const suffix = isTarget && includeIds ? ' (N1)' : ''
    lines.push(INDENT.repeat(i) + firstLine(n.text) + suffix)
  }
  // 目标直接子级（追加到下一层级）
  if (includeIds) {
    targetChildren.forEach((child, idx) => {
      lines.push(INDENT.repeat(pathIds.length) + firstLine(child.text) + ` (C${idx + 1})`)
    })
  } else {
    for (const child of targetChildren) {
      lines.push(INDENT.repeat(pathIds.length) + firstLine(child.text))
    }
  }

  // ── ## 连线表（依赖节点 ID）──
  if (includeIds && includeConnections) {
    const connections = nodeStore.getConnections(targetNodeId)
    if (connections.length > 0) {
      // 子节点 ID → 展示 ID 映射
      const idMap = new Map<string, string>()
      targetChildren.forEach((child, idx) => idMap.set(child.id, `C${idx + 1}`))

      lines.push('', '## 连线表（起点ID -> 终点ID）')
      for (const conn of connections) {
        const from = idMap.get(conn.fromNodeId)
        const to = idMap.get(conn.toNodeId)
        if (!from || !to) continue
        const arrow = conn.directed ? '-->' : '--'
        const label = conn.text ? `[${conn.text}]` : ''
        const prefix = conn.text ? '--' : ''
        lines.push(`${from} ${prefix}${label}${arrow} ${to}`)
      }
    }
  }

  return lines.join('\n')
}