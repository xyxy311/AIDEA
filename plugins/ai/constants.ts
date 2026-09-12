/**
 * AI 常量 - 本地大模型调用相关配置与提示词（迁自 src/constants/ai.ts）
 *
 * baseURL 采用 OpenAI 兼容端点（默认 Ollama: http://localhost:11434/v1）。
 * 另导出插件命名空间 id（manifest.id 与 adapter.for 的路由键）。
 */
import type { AIDivergenceDirection } from './types'

/** 插件命名空间 id（manifest.id；additions/config 自动加 `ai:` 前缀） */
export const AI_PLUGIN_ID = 'ai'

/** 生成词浮动层短 id（registerFloatingLayer 注册与 floating 运行时 API 共用，避免魔法串） */
export const AI_WORDS_LAYER_ID = 'words'

/** AI 调用默认配置（不随主题，属数据/配置范畴） */
export const AI_DEFAULT_CONFIG = {
  baseURL: 'http://localhost:11434/v1',
  apiKey: '',
  model: 'qwen2.5-coder:7b',
  // model: 'tiny-llama:1.1b',
  timeoutMs: 60000,
  temperature: 1.5,
}

/** 发散 system 提示词：AI 收到<strong>结构化节点文本</strong>（# 任务/上下文/# 指令/# 补充 分段）时的引导 */
export const AI_GENERATE_IDEA_NODE = [
  '你现在是一个头脑风暴白板 AI 助手。',
  '用户会提供当前视图的结构化节点文本（每行一个节点）作为上下文，以及一条指令。',
  '请先理解这些节点文本的结构与内容，然后严格按照指令并结合上下文发散灵感，生成一些词或短句。',
  '要求：每个描述单独一行，用换行分隔；不要有序号、编号、标点、解释或任何其它信息。',
  '每个描述不要太长，尽可能简明、一目了然，不要过于文学性。',
].join('\n')

/** 发散 system 提示词：AI 收到<strong>连贯自然语言描述</strong>时的引导（语义同结构化版本，面向连贯描述） */
export const AI_GENERATE_IDEA_DESCRIPTION = [
  '你现在是一个头脑风暴白板 AI 助手。',
  '用户会提供一段连贯的自然语言描述作为上下文，以及一条指令。',
  '请先理解这段描述的内容，然后严格按照指令并结合描述发散灵感，生成一些词或短句。',
  '要求：每个描述单独一行，用换行分隔；不要有序号、编号、标点、解释或任何其它信息。',
  '每个描述不要太长，尽可能简明、一目了然，不要过于文学性。',
].join('\n')

/** 特殊发散方向：任意发散（prompt 无 ${from}，基于上方上下文发散；面板「直接生成/重新生成」与 I 键默认用它） */
export const AI_DIRECTION_ANY: AIDivergenceDirection = {
  id: 'direction-any',
  title: '任意发散',
  prompt: '请基于上方上下文，发散一些能帮助用户思考的灵感词或短句。',
  separator: ' ',
}

/** 特殊发散方向：聚焦发散（prompt 含 ${from}，围绕发散起点发散；对有起点但无具体角度的发散） */
export const AI_DIRECTION_FOCUS: AIDivergenceDirection = {
  id: 'direction-focus',
  title: '聚焦发散',
  prompt: '请围绕「${from}」发散灵感，生成一些能帮助用户思考的灵感词或短句。',
  separator: ' ',
}

/** 剔除方向对象的 id，用于构造 Omit 版本（默认方向集合不含 id，由 aiDirections store 补发） */
function omitDirectionId(d: AIDivergenceDirection): Omit<AIDivergenceDirection, 'id'> {
  const { id, ...rest } = d
  return rest
}

/** 默认发散方向集合（用户可增删改；前两项引用特殊方向常量，其后为内嵌 ${from} 的具体角度） */
export const DEFAULT_AI_DIRECTIONS: Omit<AIDivergenceDirection, 'id'>[] = [
  omitDirectionId(AI_DIRECTION_ANY),
  omitDirectionId(AI_DIRECTION_FOCUS),
  {
    title: '为什么？',
    prompt: '从「为什么（根因 / 动机）」的角度，围绕发散起点「${from}」发散灵感，生成一些词或短句。',
    separator: ' ',
  },
  {
    title: '然后呢？',
    prompt: '从「然后呢（后果 / 下一步）」的角度，围绕发散起点「${from}」发散灵感，生成一些词或短句。',
    separator: ' ',
  },
  {
    title: '还可以怎样？',
    prompt: '从「还可以怎样（替代方案 / 不同角度）」的角度，围绕发散起点「${from}」发散灵感，生成一些词或短句。',
    separator: ' ',
  },
  {
    title: '反过来呢',
    prompt: '从「反过来（反转假设 / 视角）」的角度，围绕发散起点「${from}」发散灵感，生成一些词或短句。',
    separator: ' ',
  },
]

/** 连词成句系统提示词：把结构化节点/连线文本转为自然语言段落描述（二段式第一段） */
export const AI_SENTENCE_PROMPT = [
  '你现在是一个头脑风暴白板 AI 助手。',
  '用户会提供提示和当前视图中的离散的节点文本，这些文本的排列顺序和逻辑顺序可能不同。',
  '请根据提示，把这些内容排列成通顺的逻辑，转化为一段通顺连贯的自然语言描述，不要解释和推测任何内容。',
  '要求：',
  '不要输出 Markdown 语法，不要使用编号列表或堆砌式罗列，保持段落化、自然流畅。',
].join('\n')
