import { describe, it, expect } from 'vitest'
import {
  buildViewText,
  formatList,
  formatRows,
  getViewTextAlgorithm,
  VIEW_TEXT_ALGORITHMS,
  type ViewTextNode,
} from '../utils/viewText'

/** 便捷构造视图节点 */
function n(id: string, x: number, y: number, text: string, width = 100, height = 40): ViewTextNode {
  return { id, x, y, width, height, text }
}

// ===================================================================
// getViewTextAlgorithm
// ===================================================================
describe('getViewTextAlgorithm', () => {
  it('命中已注册算法', () => {
    expect(getViewTextAlgorithm('rowCluster')?.id).toBe('rowCluster')
  })

  it('未命中返回 undefined', () => {
    expect(getViewTextAlgorithm('nonexistent')).toBeUndefined()
  })

  it('collectAll 已注册', () => {
    expect(getViewTextAlgorithm('collectAll')?.id).toBe('collectAll')
  })
})

// ===================================================================
// formatRows / formatList
// ===================================================================
describe('formatRows / formatList', () => {
  it("formatRows([['A','B'],['C']], '\\t') → 'A\\tB\\nC'", () => {
    expect(formatRows([['A', 'B'], ['C']], '\t')).toBe('A\tB\nC')
  })

  it("formatRows([['A','B']], ' | ') → 'A | B'", () => {
    expect(formatRows([['A', 'B']], ' | ')).toBe('A | B')
  })

  it("formatList(['A','B','C']) → 'A\\nB\\nC'", () => {
    expect(formatList(['A', 'B', 'C'])).toBe('A\nB\nC')
  })

  it('空输入返回空串', () => {
    expect(formatList([])).toBe('')
    expect(formatRows([], '\t')).toBe('')
  })
})

// ===================================================================
// buildViewText - 全部收集（collectAll）
// ===================================================================
describe('buildViewText - collectAll', () => {
  it('多节点 → 每项一行、按传入顺序（不做排序/聚类）', () => {
    const nodes = [n('c', 200, 0, 'C'), n('a', 0, 0, 'A'), n('b', 100, 0, 'B')]
    expect(buildViewText(nodes, 'collectAll')).toBe('C\nA\nB')
  })

  it('includeCoords 为 true 时每项带 [x,y] 前缀', () => {
    const nodes = [n('a', 5, 10, 'A'), n('b', 20, 30, 'B')]
    expect(buildViewText(nodes, 'collectAll', { includeCoords: true })).toBe(
      '[5,10] A\n[20,30] B',
    )
  })

  it('文本取首行并 trim 多行内容', () => {
    const nodes = [n('a', 0, 0, '  标题\n副标题')]
    expect(buildViewText(nodes, 'collectAll')).toBe('标题')
  })

  it('空列表返回空串', () => {
    expect(buildViewText([], 'collectAll')).toBe('')
  })

  it('title 非空时在结构化文本开头加 "{title} :" 前缀', () => {
    const nodes = [n('a', 0, 0, 'A'), n('b', 0, 0, 'B')]
    expect(buildViewText(nodes, 'collectAll', {}, '目标')).toBe('目标 :\nA\nB')
  })

  it('title 带空白时 trim 后再作为前缀（strip）', () => {
    const nodes = [n('a', 0, 0, 'A')]
    expect(buildViewText(nodes, 'collectAll', {}, '  目标  ')).toBe('目标 :\nA')
  })

  it('title 为空/空白时不加前缀', () => {
    const nodes = [n('a', 0, 0, 'A')]
    expect(buildViewText(nodes, 'collectAll', {}, '')).toBe('A')
    expect(buildViewText(nodes, 'collectAll', {}, '   ')).toBe('A')
  })

  it('上下文正文为空时即使有 title 也返回空串（不出现孤立标题）', () => {
    expect(buildViewText([], 'collectAll', {}, '目标')).toBe('')
  })
})

// ===================================================================
// buildViewText - 行聚类（rowCluster）
// ===================================================================
describe('buildViewText - rowCluster', () => {
  it('同 y 行节点按 x 排序拼接（默认制表符）', () => {
    const nodes = [
      n('c', 200, 0, 'C'),
      n('a', 0, 0, 'A'),
      n('b', 100, 0, 'B'),
    ]
    expect(buildViewText(nodes, 'rowCluster')).toBe('A\tB\tC')
  })

  it('不同 y 的节点分行，行间换行', () => {
    const nodes = [n('a', 0, 0, 'A'), n('b', 0, 100, 'B')]
    expect(buildViewText(nodes, 'rowCluster')).toBe('A\nB')
  })

  it('tolerance 内（微小纵向间隙）视作同一行', () => {
    // 节点高 40，A 顶 0 底 40；B 顶 45 底 85，间隙 5 ≤ tolerance 10
    const nodes = [n('a', 0, 0, 'A'), n('b', 50, 45, 'B')]
    expect(buildViewText(nodes, 'rowCluster', { tolerance: 10 })).toBe('A\tB')
  })

  it('超出 tolerance 的分行', () => {
    const nodes = [n('a', 0, 0, 'A'), n('b', 50, 60, 'B')]
    expect(buildViewText(nodes, 'rowCluster', { tolerance: 10 })).toBe('A\nB')
  })

  it('自定义 separator', () => {
    const nodes = [n('a', 0, 0, 'A'), n('b', 100, 0, 'B')]
    expect(buildViewText(nodes, 'rowCluster', { separator: ' | ' })).toBe('A | B')
  })

  it('文本取首行并 trim 多行内容', () => {
    const nodes = [n('a', 0, 0, '  标题\n副标题')]
    expect(buildViewText(nodes, 'rowCluster')).toBe('标题')
  })

  it('单个节点', () => {
    expect(buildViewText([n('a', 3, 4, 'X')], 'rowCluster')).toBe('X')
  })

  it('空列表返回空串', () => {
    expect(buildViewText([], 'rowCluster')).toBe('')
  })

  it('未知算法 id 回退到第一个注册算法', () => {
    const nodes = [n('a', 0, 0, 'A'), n('b', 100, 0, 'B')]
    const algo = VIEW_TEXT_ALGORITHMS[0]
    expect(algo).toBeDefined()
    expect(buildViewText(nodes, '??', {})).toBe(buildViewText(nodes, algo!.id, {}))
  })
})

// ===================================================================
// buildViewText - 直线命中（lineHit）
// ===================================================================
describe('buildViewText - lineHit', () => {
  it('同一中心 y 的多个节点 → 单行、按 x 排序拼接', () => {
    const nodes = [n('c', 200, 0, 'C'), n('a', 0, 0, 'A'), n('b', 100, 0, 'B')]
    expect(buildViewText(nodes, 'lineHit')).toBe('A\tB\tC')
  })

  it('中心 y 差距大（> yThreshold）的两组节点 → 两行、行间换行', () => {
    const nodes = [n('a', 0, 0, 'A'), n('b', 0, 100, 'B')]
    expect(buildViewText(nodes, 'lineHit')).toBe('A\nB')
  })

  it('中心 y 差距小（< yThreshold）的两节点 → 被阈值过滤合为一行', () => {
    // a 中心 y=20，b 中心 y=25，差 5 < 默认 yThreshold 10 → 只保留一个搜索坐标
    const nodes = [n('a', 0, 0, 'A'), n('b', 100, 5, 'B')]
    expect(buildViewText(nodes, 'lineHit')).toBe('A\tB')
  })

  it('overlapRatio=0 时无重叠的相邻行不合并（各自成行）', () => {
    const nodes = [
      n('a', 0, 0, 'A'),
      n('b', 100, 0, 'B'),
      n('c', 0, 100, 'C'),
      n('d', 100, 100, 'D'),
    ]
    expect(buildViewText(nodes, 'lineHit', { overlapRatio: 0 })).toBe('A\tB\nC\tD')
  })

  it('overlapRatio=1 时仅完全相同才合并（部分重叠不合并）', () => {
    // a 跨三行，与 b/c 部分重叠：行 [a,b] 与 [a,c] 重复率 0.5 < 1 不合并
    const nodes = [n('a', 0, 0, 'A', 100, 100), n('b', 100, 0, 'B'), n('c', 200, 60, 'C')]
    expect(buildViewText(nodes, 'lineHit', { overlapRatio: 1 })).toBe('A\tB\nA\tC')
  })

  it('自定义 separator', () => {
    const nodes = [n('a', 0, 0, 'A'), n('b', 100, 0, 'B')]
    expect(buildViewText(nodes, 'lineHit', { separator: ' | ' })).toBe('A | B')
  })

  it('空列表返回空串', () => {
    expect(buildViewText([], 'lineHit')).toBe('')
  })

  it('offset 使搜索线穿过节点内部（边界不算命中）', () => {
    // 节点 (0,0,100x40) 中心 y=20
    // offset=20 → 搜索线 y=40 恰为下边界 → 严格条件不命中 → 空
    expect(buildViewText([n('a', 0, 0, 'A')], 'lineHit', { offset: 20 })).toBe('')
    // offset=5 → 搜索线 y=25 在内部 → 命中
    expect(buildViewText([n('a', 0, 0, 'A')], 'lineHit', { offset: 5 })).toBe('A')
  })

  it('文本取首行并 trim 多行内容', () => {
    const nodes = [n('a', 0, 0, '  标题\n副标题')]
    expect(buildViewText(nodes, 'lineHit')).toBe('标题')
  })
})
