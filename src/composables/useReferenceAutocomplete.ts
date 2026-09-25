/**
 * 节点引用 @ 补全共享逻辑（原生 textarea 与 naive NInput 共用）。
 * 只管理补全 UI 状态与键盘导航，不感知编辑器实现，文本读写/光标由调用方负责。
 */
import { ref, computed } from 'vue'
import { useNodeStore } from '@/stores/node'
import { findReferenceAt } from '@/utils/reference'

/** 补全候选：可引用节点名与节点 ID */
export interface AutocompleteCandidate {
  name: string
  nodeId: string
}

export function useReferenceAutocomplete() {
  const nodeStore = useNodeStore()

  /** 下拉是否可见 */
  const visible = ref(false)
  /** 当前高亮候选索引 */
  const activeIndex = ref(0)
  /** 当前已输入的 @ 前缀 */
  const query = ref('')

  /** 候选列表：按前缀过滤全部可引用节点 */
  const candidates = computed<AutocompleteCandidate[]>(() => {
    if (!visible.value) return []
    const all = nodeStore.referenceableNodes()
    const q = query.value
    if (!q) return all
    return all.filter((c) => c.name.includes(q))
  })

  /**
   * 输入时调用：根据文本与光标判断是否处于 @ 补全态。
   * 返回是否激活补全。
   */
  function handleInput(text: string, cursorPos: number): boolean {
    const ctx = findReferenceAt(text, cursorPos)
    if (!ctx) {
      visible.value = false
      return false
    }
    query.value = ctx.name
    visible.value = true
    activeIndex.value = 0
    return true
  }

  /** 关闭下拉 */
  function close(): void {
    visible.value = false
    activeIndex.value = 0
    query.value = ''
  }

  /**
   * 键盘处理：仅在 visible 时处理。返回 'handled' 表示已处理（调用方应 preventDefault），
   * 'unhandled' 表示非补全键。选中候选时返回 { insertedText, newCursorPos } 供调用方应用。
   */
  function handleKeydown(
    e: KeyboardEvent,
    text: string,
    cursorPos: number,
  ): 'unhandled' | 'handled' | { insertedText: string; newCursorPos: number } {
    if (!visible.value) return 'unhandled'
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const len = candidates.value.length
      if (len === 0) return 'handled'
      activeIndex.value = (activeIndex.value + 1) % len
      return 'handled'
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const len = candidates.value.length
      if (len === 0) return 'handled'
      activeIndex.value = (activeIndex.value - 1 + len) % len
      return 'handled'
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const picked = candidates.value[activeIndex.value]
      if (!picked) return 'unhandled' // 无候选时让 Enter 正常行为（如保存）
      e.preventDefault()
      return insertCandidate(text, cursorPos, picked.name)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return 'handled'
    }
    return 'unhandled'
  }

  /**
   * 在光标处的 @ 前缀后插入完整引用名 + 空格。
   * 返回新文本与新光标位置。
   */
  function insertCandidate(
    text: string,
    cursorPos: number,
    name: string,
  ): { insertedText: string; newCursorPos: number } {
    const ctx = findReferenceAt(text, cursorPos)
    if (!ctx) {
      return { insertedText: text, newCursorPos: cursorPos }
    }
    // 替换从 ctx.start+1（@ 后）到 cursorPos 的前缀为完整 name + 空格
    const before = text.slice(0, ctx.start + 1) // 含 @
    const after = text.slice(cursorPos)
    const inserted = before + name + ' ' + after
    const newCursor = ctx.start + 1 + name.length + 1 // @name|空格后
    close()
    return { insertedText: inserted, newCursorPos: newCursor }
  }

  return {
    visible,
    activeIndex,
    query,
    candidates,
    handleInput,
    handleKeydown,
    insertCandidate,
    close,
  }
}