/**
 * useAIWordPanel — AI 生成词的共享状态单例 + AI 生成编排（模块级）
 *
 * 本模块是共享状态单例，同时承载「AI 生成编排」与「面板展示状态」两部分逻辑，
 * 供 AIPanel 与 I 键（快捷键）共用，两者均以无参方式调用生成方法。
 *
 * - AI 生成编排：directGenerate() / regenerate() / sentenceMaking() / generatePreview()
 * - AI 模式状态：mode（快速 / 精确）、previewText（上下文预览）、sentenceText（连词成句结果）
 * - 面板展示状态：show() / close() / setMode() / clear() + visible/words/error/displayMode
 *
 * 设计边界：
 * - directGenerate() / regenerate() 无参自包含：预览为空时自动先生成上下文预览；
 *   精确模式下连词成句依赖的上下文预览为空时也自动生成预览后再连词成句。
 * - 格式转化（拆行/拼接）在此统一，调用方无需再做。
 * - 状态在模块顶层用 reactive 定义，调用方共享同一引用，保证任意组件注入结果后
 *   浮动面板组件能感知到状态变化。
 */
import { reactive, toRefs } from 'vue'
import { useStorage } from '@vueuse/core'
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { buildViewText } from '@/utils/viewText'
import { runGenerateIdea, runSentenceMaking } from '@/composables/useAIGenerate'

/** 展示模式：'strip' 底部小字条 | 'panel' 浮动面板（持久化到 localStorage） */
const displayMode = useStorage<'strip' | 'panel'>('aidea-ai-word-mode', 'strip')

/** 模块顶层单例状态 */
const state = reactive<{
  // 面板展示
  visible: boolean
  error: string | null
  words: string[]
  // AI 生成状态
  mode: 'fast' | 'precise'
  previewText: string
  sentenceText: string
  generating: boolean
  regenerating: boolean
  sentenceLoading: boolean
}>({
  visible: false,
  error: null,
  words: [],
  mode: 'fast',
  previewText: '',
  sentenceText: '',
  generating: false,
  regenerating: false,
  sentenceLoading: false,
})

// ───────────────────────────── AI 生成编排 ─────────────────────────────

/** 把模型回复按行拆成词数组（统一格式转化） */
function splitLines(reply: string): string[] {
  return reply
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/** 拼接 user 正文：全局提示词 + 局部提示词 + 主体正文（非空白部分才拼接） */
function composeUserText(body: string): string {
  const project = useProjectStore()
  const cfg = project.getAIConfig(project.currentNodeId)
  const globalPrompt = project.globalPrompt
  const localPrompt = cfg.localPrompt

  const parts: string[] = []
  if (globalPrompt.trim()) parts.push(`全局提示：${globalPrompt.trim()}`)
  if (localPrompt.trim()) parts.push(`局部提示：${localPrompt.trim()}`)
  if (body.trim()) parts.push(body.trim())
  return parts.join('\n\n')
}

/** 从 project 同步 AI 模式（保证 I 键与 AIPanel 一致、跟随节点切换） */
export function syncAIMode(): void {
  const project = useProjectStore()
  state.mode = project.getAIConfig(project.currentNodeId).mode
}

/** 生成上下文预览：用 viewText 程序计算结果填充，返回是否非空 */
export function generatePreview(): boolean {
  const project = useProjectStore()
  const nodeStore = useNodeStore()
  const cfg = project.getAIConfig(project.currentNodeId)
  state.previewText = buildViewText(
    nodeStore.childrenOf(project.currentNodeId),
    cfg.viewTextAlgoId ?? 'collectAll',
  )
  return state.previewText.trim().length > 0
}

/** 连词成句：把内部预览文本转自然语言，结果写回 sentenceText（无参） */
export async function sentenceMaking(): Promise<string> {
  if (state.sentenceLoading) return ''
  if (!state.previewText.trim()) generatePreview()
  if (!state.previewText.trim()) return ''
  state.sentenceLoading = true
  state.error = null
  const context = composeUserText(state.previewText)
  try {
    state.sentenceText = await runSentenceMaking(context)
    return state.sentenceText
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
    return ''
  } finally {
    state.sentenceLoading = false
  }
}

/** 发散并展示到浮动面板（内部共用，body 为最终输入正文） */
async function runIdeaAndShow(body: string): Promise<string[]> {
  const userContent = composeUserText(body)
  const reply = await runGenerateIdea(userContent)
  const words = splitLines(reply)
  show(words)
  return words
}

/** 直接生成（无参）：预览为空则自动生成上下文预览；精确模式连词成句为空则自动连词成句 */
export async function directGenerate(): Promise<string[]> {
  if (state.generating || state.regenerating) return []
  syncAIMode()
  state.generating = true
  state.error = null
  try {
    if (!state.previewText.trim()) generatePreview()
    let body = state.previewText
    if (state.mode === 'precise') {
      if (!state.sentenceText.trim()) {
        state.sentenceText = await sentenceMaking()
      }
      body = state.sentenceText
    }
    if (!body.trim()) return []
    return await runIdeaAndShow(body)
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
    return []
  } finally {
    state.generating = false
  }
}

/** 重新生成（无参）：强制重算上下文预览，精确模式再连词成句，然后发散 */
export async function regenerate(): Promise<string[]> {
  if (state.generating || state.regenerating) return []
  syncAIMode()
  state.regenerating = true
  state.error = null
  try {
    generatePreview()
    let body = state.previewText
    if (state.mode === 'precise') {
      state.sentenceText = await sentenceMaking()
      body = state.sentenceText
    }
    if (!body.trim()) return []
    return await runIdeaAndShow(body)
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
    return []
  } finally {
    state.regenerating = false
  }
}

/** 设置 AI 模式（快速/精确）并写回 project（随项目持久化） */
export function setAIMode(m: 'fast' | 'precise'): void {
  state.mode = m
  const project = useProjectStore()
  const id = project.currentNodeId
  const cfg = project.getAIConfig(id)
  project.setNodeAIConfig(id, { ...cfg, mode: m })
}

// ───────────────────────────── 面板展示状态 ─────────────────────────────

/** 由调用方（AIPanel 等）在 AI 生成完成后传入结果：设置 words 并打开面板 */
function show(words: string[]): void {
  state.error = null
  state.words = words
  state.visible = true
}

/** 关闭面板 */
function close(): void {
  state.visible = false
}

/** 切换展示模式（'strip' 底部小字条 | 'panel' 浮动面板） */
function setMode(mode: 'strip' | 'panel'): void {
  displayMode.value = mode
}

/** 清除状态：隐藏、清空错误与结果 */
function clear(): void {
  state.visible = false
  state.error = null
  state.words = []
}

export function useAIWordPanel() {
  // toRefs 保持响应式：解构出的 visible/error/words/mode/previewText 等均为 ref，
  // 组件模板自动解包，script 中需用 .value 访问。
  return {
    ...toRefs(state),
    displayMode,
    show,
    close,
    setMode,
    clear,
    syncAIMode,
    generatePreview,
    sentenceMaking,
    directGenerate,
    regenerate,
    setAIMode,
  }
}