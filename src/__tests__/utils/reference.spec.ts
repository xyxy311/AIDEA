import { describe, it, expect } from 'vitest'
import {
  extractReferenceName,
  parseReferenceSegments,
  findReferenceAt,
  layoutReferenceText,
  type Segment,
  type LayoutLine,
} from '../../utils/reference'

describe('extractReferenceName', () => {
  it('等号开头提取第一行', () => {
    expect(extractReferenceName('#需求')).toBe('需求')
  })

  it('多行取第一行', () => {
    expect(extractReferenceName('#需求分析\n第二行')).toBe('需求分析')
  })

  it('前导空格不算（严格 startsWith）', () => {
    expect(extractReferenceName('  #需求')).toBeNull()
  })

  it('非 # 开头返回 null', () => {
    expect(extractReferenceName('需求')).toBeNull()
  })

  it('只有 # 返回 null', () => {
    expect(extractReferenceName('#')).toBeNull()
  })

  it('# 后只有空格返回 null', () => {
    expect(extractReferenceName('#  ')).toBeNull()
  })

  it('# 后带前导空格会 trim', () => {
    expect(extractReferenceName('# 需求')).toBe('需求')
  })
})

describe('parseReferenceSegments', () => {
  it('@需求 其他 -> ref + text', () => {
    const result = parseReferenceSegments('@需求 其他')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual([
      { type: 'ref', text: '@需求', refName: '需求' },
      { type: 'text', text: ' 其他' },
    ])
  })

  it('前缀拼接 @ 前非分隔 -> 整行 text', () => {
    const result = parseReferenceSegments('前缀@需求 x')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual([{ type: 'text', text: '前缀@需求 x' }])
  })

  it('@需求 行尾 -> ref', () => {
    const result = parseReferenceSegments('@需求')
    expect(result[0]).toEqual([{ type: 'ref', text: '@需求', refName: '需求' }])
  })

  it('@需求 换行后另起一行', () => {
    const result = parseReferenceSegments('@需求\n其他')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual([{ type: 'ref', text: '@需求', refName: '需求' }])
    expect(result[1]).toEqual([{ type: 'text', text: '其他' }])
  })

  it('@ 后空格名字为空 -> @ 作为 text', () => {
    const result = parseReferenceSegments('@ 需求')
    expect(result[0]).toEqual([{ type: 'text', text: '@ 需求' }])
  })

  it('@需求其他 行尾无空格 -> 名字为整段', () => {
    const result = parseReferenceSegments('@需求其他')
    expect(result[0]).toEqual([{ type: 'ref', text: '@需求其他', refName: '需求其他' }])
  })

  it('多行混合文本', () => {
    const result = parseReferenceSegments('第一行@甲乙 尾\n@乙\n#引用')
    expect(result).toHaveLength(3)
    // 第一行：@ 前为汉字非分隔 -> 整行 text
    expect(result[0]).toEqual([{ type: 'text', text: '第一行@甲乙 尾' }])
    // 第二行：@乙 行尾 -> ref
    expect(result[1]).toEqual([{ type: 'ref', text: '@乙', refName: '乙' }])
    // 第三行：# 不参与引用解析，普通文本
    expect(result[2]).toEqual([{ type: 'text', text: '#引用' }])
  })

  it('空行返回含空 text 片段', () => {
    const result = parseReferenceSegments('a\n\nb')
    expect(result).toHaveLength(3)
    expect(result[1]).toEqual([{ type: 'text', text: '' }])
  })
})

describe('findReferenceAt', () => {
  it('光标在 @名 末尾', () => {
    expect(findReferenceAt('@需求', 3)).toEqual({ start: 0, name: '需求' })
  })

  it('光标在 @ 名中间', () => {
    expect(findReferenceAt('@需', 2)).toEqual({ start: 0, name: '需' })
  })

  it('光标恰在 @ 处', () => {
    expect(findReferenceAt('@', 1)).toEqual({ start: 0, name: '' })
  })

  it('@ 前非分隔 -> null', () => {
    expect(findReferenceAt('前缀@需', 4)).toBeNull()
  })

  it('光标紧跟已补全名字后的空格', () => {
    expect(findReferenceAt('@需求 其他', 4)).toEqual({ start: 0, name: '需求' })
  })

  it('光标越过空格进入后续文本 -> null', () => {
    expect(findReferenceAt('@需求 其他', 6)).toBeNull()
  })
})

describe('layoutReferenceText', () => {
  const fontSize = 16
  const fontFamily = 'sans-serif'
  const lineHeight = 1.5

  it('单行短文本不换行', () => {
    const paras = parseReferenceSegments('哈哈')
    const lines = layoutReferenceText(paras, 200, fontSize, fontFamily, lineHeight)
    expect(lines).toHaveLength(1)
    expect(lines[0].width).toBeGreaterThan(0)
    expect(lines[0].segments.every((s) => s.type === 'text')).toBe(true)
  })

  it('长文本换行为多行', () => {
    // 超宽内容 -> 应拆成多行
    const longText = '字'.repeat(100)
    const paras = parseReferenceSegments(longText)
    const lines = layoutReferenceText(paras, 100, fontSize, fontFamily, lineHeight)
    expect(lines.length).toBeGreaterThan(1)
    // 每行宽度不超过内容区（允许最后一个字符略超，但此处每行都满）
    for (const line of lines) {
      expect(line.width).toBeGreaterThan(0)
    }
    // y 从 0 累加行高
    expect(lines[1].y).toBeCloseTo(lines[0].y + fontSize * lineHeight, 5)
  })

  it('ref token 不可拆，放不下整体换行', () => {
    // 前置文本 'AAAA '（约 43px）填满当前行，ref '@需求'（约 42px）单独能放下但不与前置同行
    // -> ref 应整体换到下一行，保持为单个 ref 片段
    const paras = parseReferenceSegments('AAAA @需求')
    const lines = layoutReferenceText(paras, 60, fontSize, fontFamily, lineHeight)
    expect(lines.length).toBeGreaterThanOrEqual(2)
    // 最后一定包含一个 ref 片段（未被拆散）
    const lastLine = lines[lines.length - 1]
    expect(lastLine.segments.some((s) => s.type === 'ref')).toBe(true)
  })

  it('ref 本身超宽时按字符拆分', () => {
    // 超长 ref token 宽度 > contentWidth -> 拆为多个 text 片段
    const name = '超'.repeat(50)
    const paras = parseReferenceSegments('@' + name)
    const lines = layoutReferenceText(paras, 60, fontSize, fontFamily, lineHeight)
    expect(lines.length).toBeGreaterThan(1)
    // 拆分后不再有 ref 片段
    for (const line of lines) {
      for (const seg of line.segments) {
        expect(seg.type).toBe('text')
      }
    }
  })

  it('空段落占一行高', () => {
    const paras: Segment[][] = [[{ type: 'text', text: '' }]]
    const lines = layoutReferenceText(paras, 200, fontSize, fontFamily, lineHeight)
    expect(lines).toHaveLength(1)
    expect(lines[0].width).toBe(0)
  })

  it('x 为水平居中值', () => {
    const paras = parseReferenceSegments('AAA')
    const lines = layoutReferenceText(paras, 200, fontSize, fontFamily, lineHeight)
    expect(lines[0].x).toBeCloseTo((200 - lines[0].width) / 2, 5)
  })
})