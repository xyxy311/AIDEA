import { ref } from 'vue'

/**
 * 搜索输入框聚焦请求信号（模块级单例）
 *
 * 供快捷键（Ctrl/Cmd + F）与 SearchPanel 通信。
 * 面板收起时 SearchPanel 未挂载（v-if），watch 未注册，计数式信号会在面板挂载前丢失。
 * 因此改用"待处理标志"：快捷键置 true，SearchPanel 在挂载（onMounted）或运行时（watch）
 * 读取并消费（复位）该标志后聚焦，保证面板未打开时按一次 Ctrl+F 即可进入聚焦状态。
 */
export const pendingSearchFocus = ref(false)

/** 请求聚焦搜索输入框（快捷键调用） */
export function requestSearchFocus(): void {
  pendingSearchFocus.value = true
}