/**
 * 导航历史 Store —— 记录「当前查看节点」的前进/后退栈（定长 10 条，越界淘汰最旧）。
 * 纯数据：record/back/forward 只维护节点 id 序列与游标，视图切换由 project store 经 doSwitch 落地。
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

/** 导航栈最大容量（固定 10 条历史） */
export const NAV_HISTORY_MAX = 10

export const useNavigationStore = defineStore('navigation', () => {
  /** 节点 id 序列（0..len-1），cursor 指向当前导航位置 */
  const entries = ref<string[]>([])
  /** 当前位置索引（-1 表示空栈） */
  const cursor = ref(-1)

  /** 当前历史位置对应的节点 id */
  const current = computed(() => (cursor.value >= 0 ? entries.value[cursor.value] : null))

  /** 是否存在可后退的历史 */
  const canGoBack = computed(() => cursor.value > 0)
  /** 是否存在可前进的历史 */
  const canGoForward = computed(
    () => cursor.value >= 0 && cursor.value < entries.value.length - 1,
  )

  /**
   * 记录一次新的节点导航（用户切换视图时调用）。
   * 与当前位置相同则忽略（去重）；否则丢弃当前位置之后的「前进」分支再追加，
   * 超过容量时淘汰最旧历史并保持游标指向最新。
   */
  function record(nodeId: string): void {
    if (entries.value[cursor.value] === nodeId) return
    entries.value = entries.value.slice(0, cursor.value + 1)
    entries.value.push(nodeId)
    if (entries.value.length > NAV_HISTORY_MAX) {
      entries.value = entries.value.slice(entries.value.length - NAV_HISTORY_MAX)
    }
    cursor.value = entries.value.length - 1
  }

  /** 后退一步，返回目标节点 id；无可退返回 null */
  function back(): string | null {
    if (!canGoBack.value) return null
    cursor.value--
    return entries.value[cursor.value]
  }

  /** 前进一步，返回目标节点 id；无可进返回 null */
  function forward(): string | null {
    if (!canGoForward.value) return null
    cursor.value++
    return entries.value[cursor.value]
  }

  /** 清空历史（新建 / 打开项目时调用） */
  function clear(): void {
    entries.value = []
    cursor.value = -1
  }

  return {
    entries,
    cursor,
    current,
    canGoBack,
    canGoForward,
    record,
    back,
    forward,
    clear,
  }
})