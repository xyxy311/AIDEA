import { describe, it, expect } from 'vitest'
import {
  normalizeKey,
  toChordString,
  isValidChord,
  parseChord,
  formatChord,
  isModifierOnly,
} from '@/utils/shortcuts'

describe('normalizeKey', () => {
  it('单字符小写', () => {
    expect(normalizeKey('a')).toBe('a')
    expect(normalizeKey('S')).toBe('s')
    expect(normalizeKey('1')).toBe('1')
  })
  it('多字符别名映射', () => {
    expect(normalizeKey('Tab')).toBe('tab')
    expect(normalizeKey('Escape')).toBe('escape')
    expect(normalizeKey('Delete')).toBe('delete')
    expect(normalizeKey(' ')).toBe('space')
  })
  it('未知多字符整体小写', () => {
    expect(normalizeKey('F12')).toBe('f12')
  })
})

describe('toChordString', () => {
  it('无修饰只有键', () => {
    expect(toChordString({ key: 'a' })).toBe('a')
  })
  it('Ctrl/Meta 等价归为 mod', () => {
    expect(toChordString({ key: 's', ctrlKey: true })).toBe('mod+s')
    expect(toChordString({ key: 's', metaKey: true })).toBe('mod+s')
  })
  it('修饰键按固定顺序 mod+alt+shift+键', () => {
    expect(toChordString({ key: 'z', ctrlKey: true, shiftKey: true })).toBe('mod+shift+z')
    expect(toChordString({ key: '1', altKey: true })).toBe('alt+1')
  })
})

describe('isValidChord', () => {
  it('合法', () => {
    expect(isValidChord('a')).toBe(true)
    expect(isValidChord('mod+s')).toBe(true)
    expect(isValidChord('mod+alt+shift+t')).toBe(true)
    expect(isValidChord('tab')).toBe(true)
  })
  it('非法', () => {
    expect(isValidChord('')).toBe(false)
    expect(isValidChord('mod')).toBe(false) // 只剩修饰
    expect(isValidChord('control')).toBe(false) // 修饰键名
    expect(isValidChord('mod+ctrl')).toBe(false)
    expect(isValidChord('shift+a+b')).toBe(false) // 越位独立键
    expect(isValidChord(undefined as unknown as string)).toBe(false)
  })
})

describe('parseChord', () => {
  it('解析结构', () => {
    expect(parseChord('mod+shift+z')).toEqual({ key: 'z', mod: true, alt: false, shift: true })
    expect(parseChord('a')).toEqual({ key: 'a', mod: false, alt: false, shift: false })
  })
  it('非法返回 null', () => {
    expect(parseChord('mod')).toBeNull()
  })
})

describe('formatChord', () => {
  it('其它平台用 + 连接', () => {
    expect(formatChord('mod+shift+z', 'other')).toBe('Ctrl+Shift+Z')
    expect(formatChord('a', 'other')).toBe('A')
    expect(formatChord('alt+1', 'other')).toBe('Alt+1')
    expect(formatChord('tab', 'other')).toBe('Tab')
  })
  it('Mac 平台用符号', () => {
    expect(formatChord('mod+s', 'mac')).toBe('⌘S')
    expect(formatChord('mod+shift+z', 'mac')).toBe('⌘⇧Z')
  })
  it('非法输入原样返回', () => {
    expect(formatChord('mod', 'other')).toBe('mod')
  })
})

describe('isModifierOnly', () => {
  it('纯修饰返回 true', () => {
    expect(isModifierOnly('mod')).toBe(true)
    expect(isModifierOnly('control')).toBe(true)
  })
  it('含独立键返回 false', () => {
    expect(isModifierOnly('mod+s')).toBe(false)
    expect(isModifierOnly('a')).toBe(false)
  })
})