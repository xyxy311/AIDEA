// src/mcp/__tests__/naming.test.ts —— 命名纯函数：句柄最短唯一 / 同名消歧 / 颜色归一化 / 标签截断
import { describe, expect, it } from 'vitest'
import { assignNodeHandles, displayLabel, firstLineOf, normalizeHex, presetNameOf, uniqueDisplayNames } from '../naming'

describe('firstLineOf', () => {
  it('取首行并 trim；空文本返回空串', () => {
    expect(firstLineOf('  第一行\n第二行\n')).toBe('第一行')
    expect(firstLineOf('')).toBe('')
    expect(firstLineOf('  \n x')).toBe('')
  })
})

describe('displayLabel（D1）', () => {
  it('first 模式：多行追加 (+K行)', () => {
    expect(displayLabel('图例\n第2行\n第3行\n第4行\n第5行\n第6行\n第7行\n第8行', { full: false, maxChars: 40 })).toBe('图例 (+7行)')
  })

  it('first 模式：超 maxChars 截断加 …，保留 (+K行)', () => {
    const long = '很'.repeat(50)
    expect(displayLabel(`${long}\n第二行`, { full: false, maxChars: 40 })).toBe(`${'很'.repeat(40)}… (+1行)`)
  })

  it('full 模式：\\n 转义；超长截断加 (+K字)', () => {
    expect(displayLabel('第一行\n第二行', { full: true, maxChars: 40 })).toBe('第一行\\n第二行')
    const escaped = 'x'.repeat(50)
    expect(displayLabel(escaped, { full: true, maxChars: 40 })).toBe(`${'x'.repeat(40)}…(+10字)`)
  })

  it('空文本 → (空)', () => {
    expect(displayLabel('', { full: false, maxChars: 40 })).toBe('(空)')
    expect(displayLabel('  \n  ', { full: false, maxChars: 40 })).toBe('(空)')
  })

  it('displayName 覆盖首行（同名 (2) 后缀由调用方传入）', () => {
    expect(displayLabel('重名\n第2行', { full: false, maxChars: 40, displayName: '重名(2)' })).toBe('重名(2) (+1行)')
  })
})

describe('assignNodeHandles（§5.2）', () => {
  it('最短唯一前缀，从 3 位起', () => {
    const handles = assignNodeHandles(['aaaa1111bbbbccccddddd', 'bbbb2222ccccddddeeeee'])
    expect(handles.get('aaaa1111bbbbccccddddd')).toBe('aaa')
    expect(handles.get('bbbb2222ccccddddeeeee')).toBe('bbb')
  })

  it('前缀冲突加长', () => {
    const handles = assignNodeHandles(['abcdefzzzzzzzzzzzzzzz', 'abcxyzzzzzzzzzzzzzzzz'])
    expect(handles.get('abcdefzzzzzzzzzzzzzzz')).toBe('abcd')
    expect(handles.get('abcxyzzzzzzzzzzzzzzzz')).toBe('abcx')
  })

  it('输出值两两唯一；同输入必得同输出（I3 前提）', () => {
    const ids = ['q1zzzzzzzzzzzzzzzzzzz', 'q2zzzzzzzzzzzzzzzzzzz', 'q3zzzzzzzzzzzzzzzzzzz', 'q4zzzzzzzzzzzzzzzzzzz']
    const a = assignNodeHandles(ids)
    const b = assignNodeHandles(ids)
    expect([...a.entries()]).toEqual([...b.entries()])
    expect(new Set(a.values()).size).toBe(ids.length)
    for (const code of a.values()) expect(code.length).toBeGreaterThanOrEqual(3)
  })

  it('前缀含于另一 id 时双方加长（abc 与 abcd 共存）', () => {
    const handles = assignNodeHandles(['abczzzzzzzzzzzzzzzzzzz', 'abcdzzzzzzzzzzzzzzzzzz'])
    expect(handles.get('abczzzzzzzzzzzzzzzzzzz')).toBe('abcz')
    expect(handles.get('abcdzzzzzzzzzzzzzzzzzz')).toBe('abcd')
  })
})

describe('uniqueDisplayNames（§5.3）', () => {
  it('同名按输入顺序追加 (2)(3)；不同名不变', () => {
    const labels = new Map([
      ['a', '简单过渡'],
      ['b', '备注'],
      ['c', '简单过渡'],
      ['d', '简单过渡'],
    ])
    expect([...uniqueDisplayNames(labels).entries()]).toEqual([
      ['a', '简单过渡'],
      ['b', '备注'],
      ['c', '简单过渡(2)'],
      ['d', '简单过渡(3)'],
    ])
  })
})

describe('normalizeHex', () => {
  it('小写化；#ffffffff ≡ #ffffff（8 位 ff-alpha 折叠为 6 位）', () => {
    expect(normalizeHex('#FFAA00')).toBe('#ffaa00')
    expect(normalizeHex('#7d7d7dff')).toBe('#7d7d7d')
    expect(normalizeHex('#FFFFFF')).toBe('#ffffff')
    expect(normalizeHex('#FF000080')).toBe('#ff000080')
  })
})

describe('presetNameOf（§5.5 正向）', () => {
  const presets = [
    { name: 'Default', borderColor: '#7d7d7dff' },
    { name: 'Blue', borderColor: '#3b82f6' },
    { name: 'Blue2', borderColor: '#3B82F6' },
  ]

  it('归一化后精确命中（同色多预设 → 标注）', () => {
    expect(presetNameOf('#7D7D7DFF', presets)).toBe('Default')
    expect(presetNameOf('#3b82f6', presets)).toBe('Blue (=Blue2)')
  })

  it('未命中 → null', () => {
    expect(presetNameOf('#123456', presets)).toBeNull()
  })
})
