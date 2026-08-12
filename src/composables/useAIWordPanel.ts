/**
 * useAIWordPanel — AI 生成词浮动面板状态（模块级 reactive 单例）
 *
 * 复用 runAIWordGeneration() 生成词，并把结果渲染到浮动面板。
 * 状态在模块顶层用 reactive 定义，所有调用方共享同一引用，
 * 保证任意组件（如工具栏按钮）打开面板后，面板组件能感知到状态变化。
 *
 * 状态：
 * - visible  : 面板是否可见
 * - loading  : 是否正在生成
 * - error    : 生成失败信息（null 表示无错误）
 * - words    : 生成结果（每行一个词的数组）
 * - displayMode：展示模式（'strip' 底部小字条 | 'panel' 浮动面板），经 useStorage 持久化
 *
 * 动作：
 * - open()       : 重置并重新生成
 * - close()      : 关闭面板
 * - regenerate() = open()
 * - setMode()    : 在 strip / panel 之间切换展示模式
 * - clear()      : 清除状态（隐藏、清空错误与结果）
 */
import { reactive, toRefs, type Ref } from 'vue'
import { useStorage } from '@vueuse/core'
import { useProjectStore } from '@/stores/project'
import { runAIWordGeneration } from '@/composables/useAIAssist'

/** 展示模式：'strip' 底部小字条 | 'panel' 浮动面板（持久化到 localStorage） */
const displayMode = useStorage<'strip' | 'panel'>('aidea-ai-word-mode', 'strip')

/** 模块顶层单例状态 */
const state = reactive<{
  visible: boolean
  loading: boolean
  error: string | null
  words: string[]
}>({
  visible: false,
  loading: false,
  error: null,
  words: [],
})

/** 复用生成逻辑：重置 error/words → 置 loading → 调用模型 → 按行拆词 */
async function load(): Promise<void> {
  state.error = null
  state.words = []
  state.loading = true
  try {
    const project = useProjectStore()
    const raw = await runAIWordGeneration(project.currentNodeId)
    // 按 '\n' 拆行、trim、过滤空行
    state.words = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
  } finally {
    state.loading = false
  }
}

/** 打开面板并触发一次生成 */
function open(): void {
  state.visible = true
  void load()
}

/** 关闭面板 */
function close(): void {
  state.visible = false
}

/** 重新生成（等价于 open） */
function regenerate(): void {
  void load()
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
  // toRefs 保持响应式：解构出的 visible/loading/error/words 均为 ref，
  // 组件模板自动解包，script 中需用 .value 访问。
  return {
    ...toRefs(state),
    displayMode,
    open,
    close,
    regenerate,
    setMode,
    clear,
  }
}