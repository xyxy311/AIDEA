/**
 * 快捷键匹配与展示（纯函数，可单测）
 *
 * 核心表示：规范化 chord 字符串。一条组合键唯一对应一条字符串：
 *   修饰键 + 键名，修饰键按固定顺序拼接（mod > alt > shift），无修饰则只有键名。
 *   例：'a' / 'mod+s' / 'mod+shift+z' / 'alt+1' / 'tab' / 'delete'
 *
 * `mod` 表示「Ctrl 或 Meta(Cmd)」，两者等价（符合项目既有语义）。
 * 键名统一小写，特殊键映射为小写别名（Tab→'tab'、Escape→'escape' 等）。
 */
import type { ShortcutChord } from '@/types/shortcuts'

/** 事件对象最小外形（便于用构造出的对象单测） */
export interface KeyEventLike {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

/** 修饰键在字符串中的顺序 */
const MODIFIER_ORDER = ['mod', 'alt', 'shift'] as const

/** 充当修饰键本身、不能作为"独立键"赋值的键名（按下后 key 为这些值） */
const MODIFIER_KEY_NAMES = new Set([
  'control',
  'ctrl',
  'cmd',
  'meta',
  'alt',
  'option',
  'shift',
  'altgraph',
  'capslock',
  'fn',
])

/** 特殊键名 → 规范别名（e.key 到小写别名） */
const KEY_ALIAS: Record<string, string> = {
  ' ': 'space',
  Tab: 'tab',
  Escape: 'escape',
  Delete: 'delete',
  Backspace: 'backspace',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
}

/**
 * 规范化单个键名：单字符小写；多字符查别名表，否则整体小写。
 */
export function normalizeKey(key: string): string {
  const alias = KEY_ALIAS[key]
  if (alias) return alias
  if (key.length === 1) return key.toLowerCase()
  return key.toLowerCase()
}

/**
 * 把一次按键事件序列化为规范 chord 字符串。
 * Ctrl 与 Meta 均归一为 `mod`。
 */
export function toChordString(e: KeyEventLike): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('mod')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(normalizeKey(e.key))
  return parts.join('+')
}

/**
 * 校验是否为合法绑定字符串：
 * - 末尾必须是"独立键"（非修饰键名、非 mod/alt/shift 令牌）
 * - 修饰令牌只允许 mod/alt/shift，且只能出现在非末尾位置
 */
export function isValidChord(s: unknown): s is string {
  if (typeof s !== 'string') return false
  if (s.length === 0) return false
  const parts = s.split('+')
  if (parts.some((p) => p.length === 0)) return false
  const last = parts[parts.length - 1]
  if (last === 'mod' || last === 'alt' || last === 'shift') return false
  if (MODIFIER_KEY_NAMES.has(last)) return false
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] !== 'mod' && parts[i] !== 'alt' && parts[i] !== 'shift') return false
  }
  return true
}

/**
 * 把规范化字符串反向解析为结构对象（供展示/逻辑判断）。
 * 非法输入返回 null。
 */
export function parseChord(s: string): ShortcutChord | null {
  if (!isValidChord(s)) return null
  const parts = s.split('+')
  return {
    key: parts[parts.length - 1],
    mod: parts.includes('mod'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
  }
}

/** 展示用键名映射 */
const KEY_DISPLAY: Record<string, string> = {
  tab: 'Tab',
  escape: 'Esc',
  delete: 'Del',
  backspace: 'Backspace',
  space: 'Space',
  enter: 'Enter',
  home: 'Home',
  end: 'End',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
}

/**
 * 展示为人类可读字符串，按平台区分 mod：Mac 显示 ⌘/⌥/⇧ 且无 '+',
 * 其他平台显示 Ctrl/Alt/Shift 且用 '+' 连接。
 */
export function formatChord(s: string, platform?: 'mac' | 'other'): string {
  const chord = parseChord(s)
  if (!chord) return s
  const isMac =
    platform === 'mac' ||
    (platform !== 'other' &&
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad/.test(navigator.platform ?? ''))
  const key = KEY_DISPLAY[chord.key] ?? chord.key.toUpperCase()
  if (isMac) {
    const parts: string[] = []
    if (chord.mod) parts.push('⌘')
    if (chord.alt) parts.push('⌥')
    if (chord.shift) parts.push('⇧')
    parts.push(key)
    return parts.join('')
  }
  const parts: string[] = []
  if (chord.mod) parts.push('Ctrl')
  if (chord.alt) parts.push('Alt')
  if (chord.shift) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

/** 判断某个 chord 是否「修饰独占」（例如 'mod'、'control' 这类非法绑定） */
export function isModifierOnly(s: string): boolean {
  return !isValidChord(s) || MODIFIER_KEY_NAMES.has(parseChord(s)!.key)
}