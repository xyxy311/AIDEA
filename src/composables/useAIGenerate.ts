/**
 * useAIGenerate — AI 生成核心逻辑（纯文本进出）
 *
 * 只负责「加载对应提示词 → 应用户正文 → 调用模型 → 返回原始文本」。
 * 不做任何格式转化（拆行/分割）、不编 fast/precise 二段式、不拼接 global/local 提示词。
 * 以上编排由 useAIWordPanel / AIPanel.vue 负责。
 *
 * 两个工作逻辑：
 * - runSentenceMaking(text) : 连词成句（AI_SENTENCE_PROMPT）——把结构化上下文转自然语言
 * - runGenerateIdea(args)   : 发散 / 词生成——基于给定上下文 & 发散起点 & 角度发散灵感
 */
import { useAIConfigStore } from '@/stores/ai'
import { createOpenAIProvider } from '@/provider/openai'
import type { AIProvider } from '@/provider/aiProvider'
import type { AIDivergenceDirection } from '@/types/ai'
import {
  AI_SENTENCE_PROMPT,
  AI_GENERATE_IDEA_NODE,
  AI_GENERATE_IDEA_DESCRIPTION,
} from '@/constants/ai'

/** 从当前 store 读配置并创建 provider（每次调用新建，保证读到最新持久化配置） */
function createProvider(): AIProvider {
  const aiConfig = useAIConfigStore()
  return createOpenAIProvider(aiConfig.providerConfig())
}

/** 连词成句：把指定的上下文文本转自然语言描述，返回原始文本 */
export async function runSentenceMaking(text: string): Promise<string> {
  const provider = createProvider()
  const reply = await provider.chat([
    { role: 'system', content: AI_SENTENCE_PROMPT },
    { role: 'user', content: text },
  ])
  return reply
}

/**
 * 发散（词生成）：唯一统一入口，基于上下文 & 发散起点 & 角度发散灵感。
 *
 * - text（必填）   ：上下文，结构化节点文本或连贯自然语言描述
 * - isDescription  ：真 → system 用 AI_GENERATE_IDEA_DESCRIPTION，假 → AI_GENERATE_IDEA_NODE
 * - from（可选）   ：发散起点（多节点文本数组），合并为 fromText 供用户指令 ${from} 引用
 * - direction（必传）：发散方向。其 prompt 含 ${from} 时替换为 fromText；不含时 from 被天然忽略
 *                     （如「任意发散」基于上下文发散，即使传入 from 也不注入起点）
 * - addition（可选）：全局+局部提示（补充分段，可为空串）
 *
 * user 正文按「# 上下文 / # 指令 / # 补充」分段组织（# 任务描述是 system，不写入 user）。
 *
 * 纯调用层：不做拆行、不拼 global/local（那是编排层的事）。
 */
export async function runGenerateIdea(args: {
  text: string
  isDescription: boolean
  direction: AIDivergenceDirection
  from?: string[]
  addition?: string
}): Promise<string> {
  // 发散起点：from 数组按方向 separator（默认 ' '）合并成 fromText
  const separator = args.direction.separator ?? ' '
  const fromText = (args.from ?? []).filter((s) => s.trim().length > 0).join(separator)

  // 正文与起点都为空 → 无可发散内容，不调模型
  if (!args.text.trim() && !fromText.trim()) {
    throw new Error('发散缺少内容：请提供上下文文本或发散起点')
  }

  // 指令段：用方向 prompt 并把 ${from} 替换为 fromText；方向 prompt 不含 ${from} 时 from 被忽略
  const instruction = args.direction.prompt.split('${from}').join(fromText)

  // 用一级标题分段组织 user 正文，仅拼接非空段
  const parts: string[] = []
  if (args.text.trim()) parts.push(`# 上下文\n${args.text}`)
  parts.push(`# 指令\n${instruction}`)
  if (args.addition && args.addition.trim()) parts.push(`# 补充\n${args.addition}`)
  const user = parts.join('\n\n')

  const system = args.isDescription ? AI_GENERATE_IDEA_DESCRIPTION : AI_GENERATE_IDEA_NODE

  const provider = createProvider()
  const reply = await provider.chat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])
  return reply
}