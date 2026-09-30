import { describe, it, expect } from 'vitest'
import { buildTextOutline, type OutlineSource } from '@/utils/textOutline'

/** 用邻接表便捷构造 OutlineSource（id → [子 id]，text 默认为 id 本身） */
function makeSource(
  edges: Record<string, string[]>,
  texts: Record<string, string> = {},
): OutlineSource {
  return {
    textOf: (id) => texts[id] ?? id,
    childrenOf: (id) => edges[id] ?? [],
  }
}

describe('buildTextOutline', () => {
  it('深度优先 + 制表符缩进输出树形大纲', () => {
    const src = makeSource(
      {
        root: ['a1', 'a2'],
        a1: ['b1', 'b2'],
        b2: ['c1'],
        a2: [],
      },
      { root: '根节点' },
    )
    const out = buildTextOutline('root', src)
    expect(out).toBe(
      [
        '根节点',
        '\ta1',
        '\t\tb1',
        '\t\tb2',
        '\t\t\tc1',
        '\ta2',
      ].join('\n'),
    )
  })

  it('空树只输出根节点一行', () => {
    const src = makeSource({ root: [] }, { root: '根节点' })
    expect(buildTextOutline('root', src)).toBe('根节点')
  })

  it('缺失文本的节点跳过该行但仍递归其子树', () => {
    const src = {
      textOf: (id: string) => (id === 'ghost' ? undefined : id),
      childrenOf: (id: string) => ({ root: ['ghost', 'keep'] } as Record<string, string[]>)[id] ?? [],
    }
    expect(buildTextOutline('root', src)).toBe('root\n\tkeep')
  })

  it('多行文本节点如实输出到对应一行（含子树缩进）', () => {
    const src = makeSource({ root: ['a'] }, { a: '欢迎\nA 行一' })
    expect(buildTextOutline('root', src)).toBe('root\n\t欢迎\n\tA 行一')
  })
})