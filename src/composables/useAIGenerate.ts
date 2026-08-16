/**
 * useAIGenerate — AI 生成核心逻辑（纯文本进出）
 *
 * 只负责「加载对应提示词 → 调用模型 → 返回原始文本」。
 * 不做任何格式转化（拆行/分割）、不编 fast/precise 二段式、不拼接 global/local 提示词。
 * 以上编排由 useAIWordPanel / AIPanel.vue 负责。
 *
 * 两个工作逻辑：
 * - runSentenceMaking(text) : 连词成句（AI_SENTENCE_PROMPT）——把结构化上下文转自然语言
 * - runGenerateIdea(text)   : 发散 / 词生成（AI_WORD_PROMPT）——基于给定文本发散灵感
 */
import { useAIConfigStore } from '@/stores/ai'
import { createOpenAIProvider } from '@/provider/openai'
import type { AIProvider } from '@/provider/aiProvider'
import { AI_SENTENCE_PROMPT, AI_WORD_PROMPT } from '@/constants/ai'

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

/** 发散（词生成）：基于给定文本发散灵感，返回原始文本（每行一词，由调用方分割） */
export async function runGenerateIdea(text: string): Promise<string> {
  const provider = createProvider()
  const reply = await provider.chat([
    { role: 'system', content: AI_WORD_PROMPT },
    { role: 'user', content: text },
  ])
  return reply
}