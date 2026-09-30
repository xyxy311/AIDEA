import { describe, it, expect } from 'vitest'
import {
  buildTextOutline,
  parseTextForest,
  layoutTextNodes,
  TEXT_LEVEL_H_STEP,
  TEXT_LEVEL_V_STEP,
  type OutlineSource,
} from '@/utils/textOutline'

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

describe('parseTextForest', () => {
  it('解析制表符缩进为多根森林（0 缩进 = 顶层）', () => {
    const fs = parseTextForest(
      ['根节点', '\t节点A1', '\t\t节点B1', '\t节点A2'].join('\n'),
    )
    expect(fs.map((n) => n.text)).toEqual(['根节点'])
    const a1 = fs[0]!.children[0]!
    expect(a1.text).toBe('节点A1')
    expect(a1.children.map((n) => n.text)).toEqual(['节点B1'])
    expect(fs[0]!.children[1]!.text).toBe('节点A2')
  })

  it('允许多个 0 缩进根节点', () => {
    const fs = parseTextForest(['A', '\tA1', 'B', '\tB1'].join('\n'))
    expect(fs.map((n) => n.text)).toEqual(['A', 'B'])
    expect(fs[0]!.children.map((n) => n.text)).toEqual(['A1'])
    expect(fs[1]!.children.map((n) => n.text)).toEqual(['B1'])
  })

  it('空行忽略、CRLF 兼容、两个空格视为一级', () => {
    const fs = parseTextForest('A\r\n  A1\r\n\r\n  A2\r\n')
    expect(fs.map((n) => n.text)).toEqual(['A'])
    expect(fs[0]!.children.map((n) => n.text)).toEqual(['A1', 'A2'])
  })

  it('缩进越级时挂到最近的更低级父节点（收紧不报错）', () => {
    const fs = parseTextForest(
      ['root', '\t\t越级行', '\t同级', 'B'].join('\n'),
    )
    // 越级行与「\t同级」都因为缺少更浅父级而收紧为 root 的直接子级
    expect(fs.map((n) => n.text)).toEqual(['root', 'B'])
    expect(fs[0]!.children.map((n) => n.text)).toEqual(['越级行', '同级'])
  })
})

describe('layoutTextNodes', () => {
  it('每层级列数 = floor(√层节点数)，行间距固定', () => {
    // depth0: A,B 共 2 个 → 列数 floor(√2)=1；depth1: A1..A9 共 9 个 → 列数 floor(√9)=3
    const lines = ['A', 'B']
    for (let i = 1; i <= 9; i++) lines.push(`\tA${i}`)
    const placed = layoutTextNodes(parseTextForest(lines.join('\n')))

    // 层级 0：2 个节点、单列，纵向按 V_STEP 排
    expect(placed.length).toBe(2)
    expect(placed[0].x).toBe(0)
    expect(placed[0].y).toBe(0)
    expect(placed[1].x).toBe(0)
    expect(placed[1].y).toBe(TEXT_LEVEL_V_STEP)

    // 层级 1：9 个节点、3 列，起点在层级 0 之后（2 行）
    // 注：A1..A9 在文本中紧随 B（0 级）后，故归属 B（placed[1]）
    const kids = placed[1].children
    expect(kids.length).toBe(9)
    const l1 = TEXT_LEVEL_V_STEP * 2
    expect(kids[0].x).toBe(0)
    expect(kids[0].y).toBe(l1)
    expect(kids[1].x).toBe(TEXT_LEVEL_H_STEP)
    expect(kids[2].x).toBe(TEXT_LEVEL_H_STEP * 2)
    expect(kids[3].x).toBe(0)
    expect(kids[3].y).toBe(l1 + TEXT_LEVEL_V_STEP)
    // 第 6 个折行回第 1 列；第 9 个（末位）在第 3 列、第 3 行
    expect(kids[6].x).toBe(0)
    expect(kids[6].y).toBe(l1 + TEXT_LEVEL_V_STEP * 2)
    expect(kids[8].x).toBe(TEXT_LEVEL_H_STEP * 2)
    expect(kids[8].y).toBe(l1 + TEXT_LEVEL_V_STEP * 2)
  })

  it('节点数少于列数时仍单列对齐', () => {
    const placed = layoutTextNodes(parseTextForest(['A', 'B', 'C'].join('\n')))
    // 3 个 → 列数 floor(√3)=1，全在同一列
    expect(placed.map((p) => p.x)).toEqual([0, 0, 0])
    expect(placed.map((p) => p.y)).toEqual([
      0,
      TEXT_LEVEL_V_STEP,
      TEXT_LEVEL_V_STEP * 2,
    ])
  })

  it('不同层级纵向堆叠不重叠', () => {
    const placed = layoutTextNodes(
      parseTextForest(['A', '\tA1', '\tA2', 'B'].join('\n')),
    )
    // depth0 2 个 = 2 行；depth1（A1/A2，2 个）起点在其后，且同层纵向依次排列
    const d1 = TEXT_LEVEL_V_STEP * 2
    expect(placed[0].children[0].y).toBe(d1)
    expect(placed[0].children[1].y).toBe(d1 + TEXT_LEVEL_V_STEP)
  })
})