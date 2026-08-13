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
import type { WhiteboardNode, AIConfig } from '@/types'
import type { ChatMessage } from '@/provider/aiProvider'
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useAIConfigStore } from '@/stores/ai'
import { createOpenAIProvider } from '@/provider/openai'
import { AI_SENTENCE_PROMPT, AI_SYSTEM_PROMPT, AI_WORD_PROMPT } from '@/constants/ai'
import { parseReferenceSegments } from '@/utils/reference'
import { buildViewText } from '@/utils/viewText'

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
 * 拼接 user 消息正文：全局提示词 + 局部提示词 + 主体正文（非空白部分才拼接）。
 * 供 assembleTaskMessages 默认路径与 runXX 精确模式外部拼接共用，保证分层单一。
 */
function composeUserText(globalPrompt: string, localPrompt: string, body: string): string {
  const parts: string[] = []
  if (globalPrompt.trim()) parts.push(globalPrompt.trim())
  if (localPrompt.trim()) parts.push(localPrompt.trim())
  if (body.trim()) parts.push(body.trim())
  return parts.join('\n')
}

/**
 * 构建 AI 上下文文本（纯函数，可单测，不触碰任何写路径）。
 *
 * 按 aiConfig 分派：
 * - includeConnections === true → 复用现有 buildNodeContext（带连线结构化版本）
 * - false → 用 nodeStore.childrenOf(targetNodeId) + buildViewText 空间布局算法
 *
 * @param nodeStore    - 节点 store 实例（只读）
 * @param targetNodeId - 目标节点 ID
 * @param aiConfig     - 当前节点的 AI 配置
 * @returns 上下文文本字符串
 */
export function buildAIContext(nodeStore: NodeStore, targetNodeId: string, aiConfig: AIConfig): string {
  if (aiConfig.includeConnections) {
    return buildNodeContext(nodeStore, targetNodeId)
  }
  const children = nodeStore.childrenOf(targetNodeId)
  return buildViewText(children, aiConfig.viewTextAlgoId ?? 'collectAll')
}

/**
 * 组装"任务提示"消息数组（纯函数、可单测，不发起请求）。
 *
 * 职责：生成 [system(任务提示词), user(用户内容)] 两条消息。
 * - 传入 precomputedUserContent 时，直接作为 user 内容（global/local 已由外层拼接，此处不再拼）。
 * - 未传入时（快速模式默认路径），内部读取 project.globalPrompt，并按
 *   globalPrompt + localPrompt + buildAIContext(...) 拼接 user 内容。
 *
 * 快速/精确的模式分支由 runXX 编排函数负责（精确模式先把连词成句结果作为
 * precomputedUserContent 传入），本函数只做消息组装。
 *
 * @param nodeStore             - 节点 store 实例（只读）
 * @param targetNodeId          - 目标节点 ID
 * @param aiConfig              - 当前节点的 AI 配置
 * @param taskSystemPrompt      - 任务系统提示词（如 AI_SYSTEM_PROMPT / AI_WORD_PROMPT）
 * @param precomputedUserContent - 可选：已连词成句（或已拼好 global/local）的 user 内容主体
 * @returns ChatMessage[] 消息数组
 */
export function assembleTaskMessages(
  nodeStore: NodeStore,
  targetNodeId: string,
  aiConfig: AIConfig,
  taskSystemPrompt: string,
  precomputedUserContent?: string,
): ChatMessage[] {
  let userContent: string
  if (precomputedUserContent !== undefined) {
    userContent = precomputedUserContent
  } else {
    const project = useProjectStore()
    userContent = composeUserText(project.globalPrompt, aiConfig.localPrompt, buildAIContext(nodeStore, targetNodeId, aiConfig))
  }
  return [
    { role: 'system', content: taskSystemPrompt },
    { role: 'user', content: userContent },
  ]
}

/**
 * 连词成句（二段式第一段）：把结构化上下文转自然语言描述。
 * 供面板预览或 runXX 精确模式第一步调用。
 *
 * @param structuredContext - 结构化上下文文本（buildAIContext 的结果）
 * @returns 自然语言描述文本
 * @throws 调用失败时 re-throw
 */
export async function runAISentenceMaking(structuredContext: string): Promise<string> {
  const aiConfig = useAIConfigStore()
  const provider = createOpenAIProvider(aiConfig.providerConfig())
  try {
    const reply = await provider.chat([
      { role: 'system', content: AI_SENTENCE_PROMPT },
      { role: 'user', content: structuredContext },
    ])
    return reply
  } catch (err) {
    console.error('[AI 连词成句失败]', err)
    throw err
  }
}

/**
 * 调用本地 Ollama 大模型，把当前视图上下文发给模型并打印回复到控制台。
 *
 * 编排流程：
 *   1. 取目标节点（默认当前查看节点 project.currentNodeId）
 *   2. 读取 project.getAIConfig(targetId) 得到节点级 AI 配置
 *   3. fast：用 buildAIContext 生成上下文，经 assembleTaskMessages 组装任务消息
 *   4. precise：先用 runAISentenceMaking(buildAIContext(...)) 连词成句，
 *      再以自然语言文本为 user 内容组装任务消息
 *   5. 以 system（AI_SYSTEM_PROMPT）+ user 调用 chat
 *   6. console.log 打印回复并返回供调用方使用
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
  const cfg = project.getAIConfig(targetId)

  const nodeStore = useNodeStore()

  // 组装任务消息：精确模式先连词成句，快速模式直接发结构化上下文
  // 两种模式均需先做空上下文守卫（避免向模型发送空 user 内容）
  const structured = buildAIContext(nodeStore, targetId, cfg)
  if (!structured) {
    console.warn('[AI] 当前视图上下文为空')
    return ''
  }

  let messages: ChatMessage[]
  if (cfg.mode === 'precise') {
    const sentence = await runAISentenceMaking(structured)
    const userContent = composeUserText(project.globalPrompt, cfg.localPrompt, sentence)
    messages = assembleTaskMessages(nodeStore, targetId, cfg, AI_SYSTEM_PROMPT, userContent)
  } else {
    messages = assembleTaskMessages(nodeStore, targetId, cfg, AI_SYSTEM_PROMPT)
  }

  const aiConfig = useAIConfigStore()
  const provider = createOpenAIProvider(aiConfig.providerConfig())

  try {
    const reply = await provider.chat(messages)
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
 *   2. 读取 project.getAIConfig(targetId) 得到节点级 AI 配置
 *   3. 用 buildAIContext 生成上下文
 *   4. fast：直接以上下文组装 AI_WORD_PROMPT 消息；
 *      precise：先 runAISentenceMaking 连词成句，再以自然语言组装
 *   5. 以 system（AI_WORD_PROMPT）+ user 调用 chat
 *   6. console.log 打印模型回复并返回供调用方使用
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
  const cfg = project.getAIConfig(targetId)

  const nodeStore = useNodeStore()
  const structured = buildAIContext(nodeStore, targetId, cfg)
  if (!structured) {
    console.warn('[AI] 当前视图上下文为空')
    return ''
  }
  console.log(structured)

  // 精确模式先连词成句，快速模式直接发结构化上下文
  let messages: ChatMessage[]
  if (cfg.mode === 'precise') {
    const sentence = await runAISentenceMaking(structured)
    const userContent = composeUserText(project.globalPrompt, cfg.localPrompt, sentence)
    messages = assembleTaskMessages(nodeStore, targetId, cfg, AI_WORD_PROMPT, userContent)
  } else {
    messages = assembleTaskMessages(nodeStore, targetId, cfg, AI_WORD_PROMPT)
  }

  const aiConfig = useAIConfigStore()
  const provider = createOpenAIProvider(aiConfig.providerConfig())

  try {
    const reply = await provider.chat(messages)
    return reply
  } catch (err) {
    console.error('[AI 词生成失败]', err)
    throw err
  }
}