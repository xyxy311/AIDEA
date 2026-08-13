/**
 * useAIWordPanel — AI 生成词浮动面板共享状态单例（模块级 reactive）
 *
 * 本模块是共享状态单例，**不运行 AI 生成**。
 * 浮动面板（FloatingAIWordPanel / FloatingAIWordStrip）只读取 words/error 展示内容；
 * show(words) 由调用方（AIPanel 等）在 AI 生成完成后同步注入结果并打开面板。
 * 已移除 loading（生成进度由调用方自己管理）。
 * 状态在模块顶层用 reactive 定义，所有调用方共享同一引用，
 * 保证任意组件（如 AIPanel / 快捷键）注入结果后，浮动面板组件能感知到状态变化。
 *
 * 状态：
 * - visible  : 面板是否可见
 * - error    : 生成失败信息（null 表示无错误）
 * - words    : 生成结果（每行一个词的数组）
 * - displayMode：展示模式（'strip' 底部小字条 | 'panel' 浮动面板），经 useStorage 持久化
 *
 * 动作：
 * - show(words) : 由调用方在 AI 生成完成后传入结果：设置 words 并打开面板
 * - close()   : 关闭面板
 * - setMode() : 在 strip / panel 之间切换展示模式
 * - clear()   : 清除状态（隐藏、清空错误与结果）
 */
import { reactive, toRefs } from 'vue'
import { useStorage } from '@vueuse/core'

/** 展示模式：'strip' 底部小字条 | 'panel' 浮动面板（持久化到 localStorage） */
const displayMode = useStorage<'strip' | 'panel'>('aidea-ai-word-mode', 'strip')

/** 模块顶层单例状态 */
const state = reactive<{
  visible: boolean
  error: string | null
  words: string[]
}>({
  visible: false,
  error: null,
  words: [],
})

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
  // toRefs 保持响应式：解构出的 visible/error/words 均为 ref，
  // 组件模板自动解包，script 中需用 .value 访问。
  return {
    ...toRefs(state),
    displayMode,
    show,
    close,
    setMode,
    clear,
  }
}