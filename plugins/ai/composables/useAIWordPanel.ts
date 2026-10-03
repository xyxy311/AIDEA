/**
 * useAIWordPanel — AI 生成词的共享状态单例 + AI 生成编排（模块级）
 *
 * 本模块是共享状态单例，同时承载「AI 生成编排」与「面板展示状态」两部分逻辑，
 * 供 AIPanel 与 I 键（快捷键）共用，两者均以无参方式调用生成方法。
 *
 * - AI 生成编排：directGenerate() / regenerate() / sentenceMaking() / generatePreview()
 * - AI 模式状态：mode（快速 / 精确）、previewText（上下文预览）、sentenceText（连词成句结果）
 * - 面板展示状态：show() / close() / clear() + visible/words/error
 *
 * 插件化改造（相对原主程序版）：
 * - 删除紧凑模式：displayMode / setMode 与 useStorage('aidea-ai-word-mode') 不再保留，
 *   生成词仅浮动面板一种展示（FloatingAIWordPanel 经插件浮动层注册渲染，窗口壳
 *   由通用件 FloatingWindow（components/common）提供）。
 * - 显隐归插件浮动运行时 API：本模块经 adapter.for(AI_PLUGIN_ID).floating（短 id
 *   AI_WORDS_LAYER_ID）open/close；visible 只读暴露 floating.isVisible（宿主窗口按
 *   pluginFloating store 显隐，本模块不持有显隐状态）。
 * - 项目级 AI 配置（globalPrompt / getAIConfig / setAIMode 写回）改经 stores/aiProject
 *   的 additions `ai:projectConfig` 键；节点数据读取改经 adapter.api.node（不依赖主程序
 *   project store 的 AI 字段）。
 *
 * 设计边界：
 * - directGenerate() / regenerate() 无参自包含：预览为空时自动先生成上下文预览；
 *   精确模式下连词成句依赖的上下文预览为空时也自动生成预览后再连词成句。
 * - 格式转化（拆行/拼接）在此统一，调用方无需再做。
 * - 状态在模块顶层用 reactive 定义，调用方共享同一引用，保证任意组件注入结果后
 *   浮动面板组件能感知到状态变化。
 */
import { reactive, toRefs, computed } from 'vue'
import { adapter } from '@/plugin/adapter'
import { buildViewText } from '../utils/viewText'
import { runGenerateIdea, runSentenceMaking } from './useAIGenerate'
import { useAIDirectionsStore } from '../stores/aiDirections'
import {
  currentViewedNodeId,
  getAIConfig,
  loadProjectData,
  setNodeAIConfig,
} from '../stores/aiProject'
import { AI_PLUGIN_ID, AI_WORDS_LAYER_ID } from '../constants'
import type { AIDivergenceDirection } from '../types'

/** 模块顶层单例状态 */
const state = reactive<{
  // 面板展示（仅内容态：words/error；显隐已归浮动层运行时 store，见下方 visible）
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
  error: null,
  words: [],
  mode: 'fast',
  previewText: '',
  sentenceText: '',
  generating: false,
  regenerating: false,
  sentenceLoading: false,
})

/**
 * 生成词浮动层运行时（for 有模块级缓存，与 index.ts 的 scope 同一实例）；
 * for 只创建闭包不触碰 pinia，模块加载期安全，方法体内才 useStore。
 */
const floating = adapter.for(AI_PLUGIN_ID).floating

// ───────────────────────────── AI 生成编排 ─────────────────────────────

/** 把模型回复按行拆成词数组（统一格式转化） */
function splitLines(reply: string): string[] {
  return reply
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/** 拼接补充分段（addition）：全局提示词 + 局部提示词（非空白部分才拼接，不含 body） */
function composeAddition(): string {
  const nodeId = currentViewedNodeId()
  const cfg = getAIConfig(nodeId)
  const data = loadProjectData()

  const parts: string[] = []
  if (data.globalPrompt.trim()) parts.push(data.globalPrompt.trim())
  if (cfg.localPrompt.trim()) parts.push(cfg.localPrompt.trim())
  return parts.join('\n')
}

/** 推导是否「连贯描述」：精确模式 body 是连词成句的连贯描述→true；快速模式 body 是结构化→false */
function isDescriptionBody(): boolean {
  return state.mode === 'precise'
}

/** 从项目级配置同步 AI 模式（保证 I 键与 AIPanel 一致、跟随节点切换） */
export function syncAIMode(): void {
  state.mode = getAIConfig(currentViewedNodeId()).mode
}

/** 生成上下文预览：用 viewText 程序计算结果填充，返回是否非空 */
export function generatePreview(): boolean {
  const nodeId = currentViewedNodeId()
  const cfg = getAIConfig(nodeId)
  // 标题 = 祖先链路径「根节点/父节点1/.../当前视图节点」。
  // 当前视图无子节点时，仍以其作为上下文预览，保证空视图也能生成预览并启用 AI 功能；
  // 有子节点时作为结构化文本前缀交给 viewText 编排。
  const title = ancestorPathTitle(nodeId)
  const children = adapter.api.node.children(nodeId)
  if (children.length === 0) {
    state.previewText = title
    return state.previewText.trim().length > 0
  }
  state.previewText = buildViewText(children, cfg.viewTextAlgoId ?? 'collectAll', {}, title)
  return state.previewText.trim().length > 0
}

/** 祖先链标题：根节点/父节点1/.../当前视图节点（取链上各节点 text 首行，去空后用 '/' 拼接） */
function ancestorPathTitle(nodeId: string): string {
  return adapter.api.node
    .pathToRoot(nodeId)
    .reverse() // [root, ..., 直接父节点, 当前视图节点]
    .map((id) => adapter.api.node.get(id)?.text.split('\n')[0].trim() ?? '')
    .filter((s) => s.length > 0)
    .join('/')
}

/** 连词成句：把内部预览文本转自然语言，结果写回 sentenceText（无参） */
export async function sentenceMaking(): Promise<string> {
  if (state.sentenceLoading) return ''
  if (!state.previewText.trim()) generatePreview()
  if (!state.previewText.trim()) return ''
  state.sentenceLoading = true
  state.error = null
  // 连词成句正文：全局提示 + 局部提示 + 预览正文（非空白部分才拼接）
  const data = loadProjectData()
  const cfg = getAIConfig(currentViewedNodeId())
  const parts: string[] = []
  if (data.globalPrompt.trim()) parts.push(`全局提示：${data.globalPrompt.trim()}`)
  if (cfg.localPrompt.trim()) parts.push(`局部提示：${cfg.localPrompt.trim()}`)
  if (state.previewText.trim()) parts.push(state.previewText.trim())
  const context = parts.join('\n\n')
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

/** 发散并展示到浮动面板（内部共用；direction 为发散方向，body 为最终输入正文，addition 为全局+局部补充分段） */
async function runIdeaAndShow(body: string, direction: AIDivergenceDirection): Promise<string[]> {
  const reply = await runGenerateIdea({
    text: body,
    isDescription: isDescriptionBody(),
    direction,
    addition: composeAddition(),
  })
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
    // 用用户设置的默认发散方向（未设置/失效时 store 回退任意发散）
    const direction = useAIDirectionsStore().getDefaultDirection()
    return await runIdeaAndShow(body, direction)
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
    // 用用户设置的默认发散方向（未设置/失效时 store 回退任意发散）
    const direction = useAIDirectionsStore().getDefaultDirection()
    return await runIdeaAndShow(body, direction)
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
    return []
  } finally {
    state.regenerating = false
  }
}

/**
 * 定向发散（发散起点 + 发散方向）：围绕指定起点按方向发散灵感。
 *
 * 语义与 directGenerate 一致的无参自包含 + 跟随 fast/precise 二段式：
 * - mode 为 precise 时先连词成句，再以连词成句结果为正文定向发散
 * - 上下文（previewText）为空时自动用 viewText 重算当前视图上下文
 *
 * @param from      发散起点（选中节点文本数组；与 text 全空时直接返回空数组，不调模型）
 * @param direction 发散方向（必传）。「直接发散」语义由 AI_DIRECTION_FOCUS 表达；
 *                  方向 prompt 含 ${from} 则注入起点，无 ${from}（如任意发散）则忽略 from
 * @returns 拆行后的词数组；未生成或失败时返回空数组（不向外抛出）
 */
export async function generateDirectional(
  from: string[],
  direction: AIDivergenceDirection,
): Promise<string[]> {
  if (state.generating || state.regenerating) return []
  syncAIMode()
  state.generating = true
  state.error = null
  try {
    // 上下文为空则自动生成预览
    if (!state.previewText.trim()) generatePreview()
    let body = state.previewText
    // 精确模式：连词成句为空则自动连词成句，再以句子为正文
    if (state.mode === 'precise') {
      if (!state.sentenceText.trim()) {
        state.sentenceText = await sentenceMaking()
      }
      body = state.sentenceText
    }
    // body 与 from 都为空 → 不调模型
    if (!body.trim() && (from ?? []).every((s) => !s.trim())) return []
    const reply = await runGenerateIdea({
      text: body,
      isDescription: isDescriptionBody(),
      direction,
      from,
      addition: composeAddition(),
    })
    const words = splitLines(reply)
    show(words)
    return words
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
    return []
  } finally {
    state.generating = false
  }
}

/** 设置 AI 模式（快速/精确）并写回项目级 additions 配置（随项目持久化） */
export function setAIMode(m: 'fast' | 'precise'): void {
  state.mode = m
  const id = currentViewedNodeId()
  setNodeAIConfig(id, { ...getAIConfig(id), mode: m })
}

// ───────────────────────────── 面板展示状态 ─────────────────────────────

/**
 * 由调用方（AIPanel / runIdeaAndShow 等）在 AI 生成完成后传入结果：
 * 设置 words 并经浮动层运行时 API 打开面板（登记 key `ai:words`）。
 */
function show(words: string[]): void {
  state.error = null
  state.words = words
  floating.open(AI_WORDS_LAYER_ID)
}

/** 关闭面板（经浮动层运行时 API；幂等） */
function close(): void {
  floating.close(AI_WORDS_LAYER_ID)
}

/** 清除状态：隐藏、清空错误与结果 */
function clear(): void {
  close()
  state.error = null
  state.words = []
}

export function useAIWordPanel() {
  // toRefs 保持响应式：解构出的 error/words/mode/previewText 等均为 ref，
  // 组件模板自动解包，script 中需用 .value 访问。
  return {
    ...toRefs(state),
    // 显隐归宿主浮动层 store（open 才可见）；只读 computed 暴露保持原 API 形状
    visible: computed(() => floating.isVisible(AI_WORDS_LAYER_ID)),
    show,
    close,
    clear,
    syncAIMode,
    generatePreview,
    sentenceMaking,
    directGenerate,
    regenerate,
    generateDirectional,
    setAIMode,
  }
}
