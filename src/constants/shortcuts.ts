/**
 * 快捷键注册表元数据
 *
 * - CUSTOM_SHORTCUTS：可被用户自定义的动作（id / labelKey / scope / 默认绑定）
 * - RESERVED_CHORDS：锁定键占用的 chord（OS 级、删除、Escape、方向键、Enter、数字序号），
 *   不可被自定义动作占用。
 *
 * 键名一律为 utils/shortcuts.ts 的规范化字符串（'mod+s' / 'a' / 'tab' …）。
 * 注意：Delete 键在 e.key 下既可能是 'Delete' 也可能是 'Backspace'，故两者都加入锁定集合。
 */
import type { ShortcutScope } from '@/types/shortcuts'

/** 自定义动作定义 */
export interface ShortcutDef {
  /** 唯一 id（store 持久化 key） */
  id: string
  /** i18n key（经 t() 读取显示文案） */
  labelKey: string
  scope: ShortcutScope
  /** 默认绑定（规范化字符串） */
  default: string
}

/** 可被用户自定义的动作列表 */
export const CUSTOM_SHORTCUTS: ShortcutDef[] = [
  { id: 'save', labelKey: 'shortcuts.actionSave', scope: 'always', default: 'mod+s' },
  { id: 'open', labelKey: 'shortcuts.actionOpen', scope: 'always', default: 'mod+o' },
  { id: 'new', labelKey: 'shortcuts.actionNew', scope: 'always', default: 'mod+n' },
  { id: 'search', labelKey: 'shortcuts.actionSearch', scope: 'always', default: 'mod+f' },
  { id: 'group', labelKey: 'shortcuts.actionGroup', scope: 'canvas', default: 'mod+g' },
  { id: 'enterChild', labelKey: 'shortcuts.actionEnterChild', scope: 'canvas', default: 'a' },
  { id: 'enterParent', labelKey: 'shortcuts.actionEnterParent', scope: 'canvas', default: 'q' },
  { id: 'toggleInline', labelKey: 'shortcuts.actionToggleInline', scope: 'canvas', default: 'tab' },
  { id: 'fitInline', labelKey: 'shortcuts.actionFitInline', scope: 'canvas', default: 'r' },
  { id: 'deleteSelected', labelKey: 'shortcuts.actionDelete', scope: 'canvas', default: 'd' },
]

/** 可自定义动作的 id 集合（用于 store 自愈过滤） */
export const CUSTOM_SHORTCUT_IDS: string[] = CUSTOM_SHORTCUTS.map((s) => s.id)

/** 序号修饰键默认值（T + 1-9 打标签） */
export const DEFAULT_SEQ_MOD_KEY = 't'

/**
 * 锁定键占用的 chord，不可被自定义动作占用。
 * 含：撤销/重做、复制/剪切/粘贴、删除键（Delete/Backspace）、Escape、
 *     方向键（移动选中节点）、Enter（编辑选中节点）、数字序号 1-9。
 * 注意：字母 `d` 的删除已作为可自定义动作 deleteSelected（默认 d），不在锁定集合内。
 * 注意：方向键 chord 为 utils/shortcuts.ts 规范化后的 'up'/'down'/'left'/'right'
 *      （KEY_ALIAS 将 ArrowUp→'up' 等），而非 'arrowup' 字面。
 */
export const RESERVED_CHORDS: string[] = [
  // 撤销 / 重做
  'mod+z',
  'mod+shift+z',
  'mod+y',
  // 对象剪贴板
  'mod+c',
  'mod+x',
  'mod+v',
  // 删除键（Delete / Backspace 固定，不可自定义）
  'delete',
  'backspace',
  // 取消选中
  'escape',
  // 方向键（移动选中节点；规范化 chord 为 up / down / left / right）
  'up',
  'down',
  'left',
  'right',
  // 编辑选中节点
  'enter',
  // 数字序号（预设 / 打标签）
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
]