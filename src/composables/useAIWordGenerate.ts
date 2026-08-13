/**
 * useAIWordGenerate — AI 生成词的编排（生成 + 展示）
 *
 * 供键盘快捷键（AppShell 的 I 键）等非面板入口使用。
 * 生成逻辑不放在 useAIWordPanel（该模块只做共享状态 + show），
 * 由本函数负责「调用模型 → 拆行 → show(words)」。
 */
import { runAIWordGeneration } from '@/composables/useAIAssist'
import { useAIWordPanel } from '@/composables/useAIWordPanel'

/** 生成 AI 词并在完成后展示到浮动面板 */
export async function generateAndShowWords(): Promise<void> {
  const { show } = useAIWordPanel()
  const raw = await runAIWordGeneration()
  const words = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  show(words)
}