/**
 * 自定义快捷键类型定义
 *
 * 所有快捷键以「规范化字符串」为核心表示（见 utils/shortcuts.ts），
 * 字符串即等价判定：`mod` = Ctrl 或 Meta（Cmd），修饰键按固定顺序拼接。
 * 一个字符串唯一对应一种按键组合，因此可直接作为 Map 的 key 用于 O(1) 查表。
 */

/** 快捷键触发作用域：在输入框/编辑守卫之前还是之后触发 */
export type ShortcutScope = 'always' | 'canvas'

/** 解析后的快捷键组合（由字符串反向解析，用于展示与校验） */
export interface ShortcutChord {
  /** 规范键名：'a' / 's' / 'tab' / 'delete' / '1' … 小写 */
  key: string
  /** 是否要求 Ctrl 或 Meta（Cmd） */
  mod: boolean
  /** 是否要求 Alt */
  alt: boolean
  /** 是否要求 Shift */
  shift: boolean
}