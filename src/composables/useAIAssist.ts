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
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useAIConfigStore } from '@/stores/ai'
import { createOpenAIProvider } from '@/provider/openai'
import { AI_SYSTEM_PROMPT, AI_WORD_PROMPT } from '@/constants/ai'
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

/** 收集子树选项 */
export interface CollectSubtreeOptions {
  /**
   * 最大收集深度（指"子级层数"）：1 = 只收集第一层子级；
   * undefined = 收集所有层（完整递归）。
   */
  maxDepth?: number
  /** 第一层子级的缩进层级（0 = 无缩进）。默认 0 */
  baseIndent?: number
}

/**
 * 收集给定节点的所有子级，按缩进格式构成字符串行。
 *
 * 每行已带缩进（第一层子级缩进 baseIndent 级，往下一级 +1）。
 * 不包含节点自身，只收集其子级。
 *
 * @param nodeStore - 节点 store 实例（只读）
 * @param nodeId    - 父节点 ID
 * @param options   - 控制深度与起始缩进
 * @returns 带缩进的子级文本行数组（按 childrenOf 顺序）
 */
export function collectSubtree(
  nodeStore: NodeStore,
  nodeId: string,
  options: CollectSubtreeOptions = {},
): string[] {
  const { maxDepth, baseIndent = 0 } = options
  const lines: string[] = []

  const walk = (parentId: string, depth: number): void => {
    for (const child of nodeStore.childrenOf(parentId)) {
      lines.push(INDENT.repeat(baseIndent + depth - 1) + firstLine(child.text))
      if (maxDepth === undefined || depth < maxDepth) {
        walk(child.id, depth + 1)
      }
    }
  }

  walk(nodeId, 1)
  return lines
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
    lines.push(...collectSubtree(nodeStore, refNode.id, { baseIndent: 1 }))
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

/**
 * 调用本地 Ollama 大模型，把当前视图上下文发给模型并打印回复到控制台。
 *
 * 编排流程：
 *   1. 取目标节点（默认当前查看节点 project.currentNodeId）
 *   2. 用 buildNodeContext 生成结构化上下文
 *   3. 读取 aiConfig store 配置，创建 OpenAI 兼容 provider
 *   4. 以 system（AI_SYSTEM_PROMPT）+ user（上下文）调用 chat
 *   5. console.log 打印回复并返回供调用方使用
 *
 * 本次只打印到控制台，不渲染到画布。
 *
 * @param targetNodeId - 目标节点 ID；缺省用当前查看节点
 * @returns 模型回复文本
 * @throws 上下文中空时返回空字符串；调用失败时 re-throw
 */
export async function runAIAssist(targetNodeId?: string): Promise<string> {
  const project = useProjectStore()
  const targetId = targetNodeId ?? project.currentNodeId

  const nodeStore = useNodeStore()
  const context = buildNodeContext(nodeStore, targetId)
  if (!context) {
    console.warn('[AI] 当前视图上下文为空')
    return ''
  }

  const aiConfig = useAIConfigStore()
  const provider = createOpenAIProvider(aiConfig.providerConfig())

  try {
    const reply = await provider.chat([
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'user', content: context },
    ])
    console.log('[AI 回复]', reply)
    return reply
  } catch (err) {
    console.error('[AI 调用失败]', err)
    throw err
  }
}

/**
 * AI 词生成工作流：把当前视图展示的节点（视口一层深度子级）发给模型，
 * 让模型随机生成 10 个词（换行分隔，无序号等其它信息），打印到控制台。
 *
 * 编排流程：
 *   1. 取目标节点（默认当前查看节点 project.currentNodeId）
 *   2. 用 collectSubtree(targetId, { maxDepth: 1 }) 收集视口展示的所有节点（一层深度）
 *   3. 读取 aiConfig store 配置，创建 OpenAI 兼容 provider
 *   4. 以 system（AI_WORD_PROMPT）+ user（节点列表）调用 chat
 *   5. console.log 打印模型回复并返回供调用方使用
 *
 * 本次只打印到控制台，不渲染到画布。
 *
 * @param targetNodeId - 目标节点 ID；缺省用当前查看节点
 * @returns 模型回复文本（每行一个词）
 * @throws 上下文为空时返回空字符串；调用失败时 re-throw
 */
export async function runAIWordGeneration(targetNodeId?: string): Promise<string> {
  const project = useProjectStore()
  const targetId = targetNodeId ?? project.currentNodeId

  const nodeStore = useNodeStore()
  const nodes = collectSubtree(nodeStore, targetId, { maxDepth: 1 })
  if (nodes.length === 0) {
    console.warn('[AI] 当前视图无子级节点')
    return ''
  }
  const context = nodes.join('\n')

  const aiConfig = useAIConfigStore()
  const provider = createOpenAIProvider(aiConfig.providerConfig())

  try {
    const reply = await provider.chat([
      { role: 'system', content: AI_WORD_PROMPT },
      { role: 'user', content: context },
    ])
    console.log('[AI 词生成回复]', reply)
    return reply
  } catch (err) {
    console.error('[AI 词生成失败]', err)
    throw err
  }
}