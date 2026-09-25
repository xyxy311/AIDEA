import { ref } from 'vue'

/**
 * 搜索输入框聚焦请求信号（模块级单例）。面板收起未挂载时 watch 不生效，
 * 故用"待处理标志"：快捷键置 true，SearchPanel 挂载/运行时读取并复位后聚焦。
 */
export const pendingSearchFocus = ref(false)

/** 请求聚焦搜索输入框（快捷键调用） */
export function requestSearchFocus(): void {
  pendingSearchFocus.value = true
}