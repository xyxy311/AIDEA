// 右键菜单状态管理：维护菜单可见性、视口坐标与菜单项列表
import { ref } from 'vue'
import type { Component } from 'vue'

/** 右键菜单项 */
export interface ContextMenuItem {
  /** 唯一标识，用于选中回调分发 */
  key: string
  /** 显示文本 */
  label: string
  /** 是否禁用 */
  disabled?: boolean
  /** 危险操作样式（红色文字） */
  danger?: boolean
  /** 可选图标组件（如 @vicons/ionicons5 的图标） */
  icon?: Component
  /** 点击该项时执行的行为（由调用方在 select 回调中触发） */
  action?: () => void
  /** 二级子菜单项（有 children 时该项作为父级，hover/点击展开子菜单） */
  children?: ContextMenuItem[]
}

/**
 * 右键菜单状态管理
 *
 * 负责菜单的显示/隐藏、定位与菜单项内容。
 * 菜单坐标使用浏览器视口坐标（clientX/clientY），
 * 由 ContextMenu 组件以 position:fixed 定位渲染。
 */
export function useContextMenu() {
  /** 菜单是否可见 */
  const visible = ref(false)
  /** 菜单左上角 X（视口坐标） */
  const x = ref(0)
  /** 菜单左上角 Y（视口坐标） */
  const y = ref(0)
  /** 当前菜单项列表 */
  const items = ref<ContextMenuItem[]>([])

  /** 打开菜单 */
  function open(clientX: number, clientY: number, menuItems: ContextMenuItem[]): void {
    x.value = clientX
    y.value = clientY
    items.value = menuItems
    visible.value = true
  }

  /** 关闭菜单 */
  function close(): void {
    visible.value = false
  }

  return {
    visible,
    x,
    y,
    items,
    open,
    close,
  }
}
