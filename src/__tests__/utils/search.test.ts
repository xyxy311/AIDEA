import { describe, it, expect } from 'vitest'
import {
  highlightLine,
  buildDisplayLine,
  buildSearchLines,
  searchNodes,
  type HighlightSegment,
} from '../../utils/search'
import type { WhiteboardNode } from '../../types'

// ===================================================================
// highlightLine
// ===================================================================
describe('highlightLine', () => {
  it('无命中返回单个普通分段', () => {
    expect(highlightLine('abc', 'z')).toEqual([{ text: 'abc', match: false }])
  })

  it('命中切分并保留原始大小写', () => {
    expect(highlightLine('AbCac', 'ac')).toEqual([
      { text: 'AbC', match: false },
      { text: 'ac', match: true },
    ])
  })

  it('大小写不敏感', () => {
    const segs = highlightLine('需求分析', '需求')
    expect(segs).toEqual([
      { text: '需求', match: true },
      { text: '分析', match: false },
    ])
  })

  it('多段命中', () => {
    const segs = highlightLine('aaXaaXaa', 'x')
    const matches = segs.filter((s) => s.match)
    expect(matches).toHaveLength(2)
  })

  it('空 query 返回整行普通分段', () => {
    expect(highlightLine('abc', '')).toEqual([{ text: 'abc', match: false }])
  })
})

// ===================================================================
// buildDisplayLine
// ===================================================================
describe('buildDisplayLine', () => {
  it('短行直接返回整行高亮', () => {
    const segs = buildDisplayLine('需求', '需', 60)
    expect(segs).toEqual([
      { text: '需', match: true },
      { text: '求', match: false },
    ])
  })

  it('超长无命中：截尾 + 省略号', () => {
    const line = 'a'.repeat(100)
    const segs = buildDisplayLine(line, 'zzz', 10)
    expect(segs[segs.length - 1]).toEqual({ text: '…', match: false })
    // 内容为前 10 个字符
    expect(segs[0].text).toBe('a'.repeat(10))
  })

  it('超长命中：命中完整保留在窗口内', () => {
    const line = 'x'.repeat(100) + 'HI' + 'y'.repeat(100)
    const segs = buildDisplayLine(line, 'hi', 20)
    const hit = segs.find((s) => s.match)
    expect(hit).toBeDefined()
    expect(hit!.text).toBe('HI')
    // 首尾应有省略号
    expect(segs[0].text).toBe('…')
    expect(segs[segs.length - 1].text).toBe('…')
    // 总分段长度受窗口约束（窗口 + 至多 2 个省略号）
    const totalLen = segs.reduce((acc, s) => acc + s.text.length, 0)
    expect(totalLen).toBeLessThanOrEqual(22)
  })

  it('空行返回空数组', () => {
    expect(buildDisplayLine('', 'x', 60)).toEqual([])
  })
})

// ===================================================================
// buildSearchLines
// ===================================================================
describe('buildSearchLines', () => {
  it('命中在首行：body 为 null', () => {
    const { title, body } = buildSearchLines('需求分析\n第二行', '需求', 60)
    expect(body).toBeNull()
    expect(title.some((s) => s.match)).toBe(true)
  })

  it('命中在非首行：title 无命中，body 有命中', () => {
    const { title, body } = buildSearchLines('标题\n这里命中需求\n第三行', '需求', 60)
    expect(body).not.toBeNull()
    expect(body!.some((s) => s.match)).toBe(true)
    expect(title.some((s) => s.match)).toBe(false)
  })
})

// ===================================================================
// searchNodes
// ===================================================================
function makeNode(partial: Partial<WhiteboardNode> & { id: string; text: string }): WhiteboardNode {
  return {
    parentId: 'root',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    borderColor: '#000',
    connections: [],
    ...partial,
  } as WhiteboardNode
}

describe('searchNodes', () => {
  it('普通过滤 + 排除根节点', () => {
    const nodes = [
      makeNode({ id: 'root', text: '项目名', parentId: null }),
      makeNode({ id: 'a', text: '需求分析' }),
      makeNode({ id: 'b', text: '别的' }),
    ]
    const res = searchNodes(nodes, '需求')
    expect(res.map((r) => r.nodeId)).toEqual(['a'])
  })

  it('大小写不敏感', () => {
    const nodes = [makeNode({ id: 'a', text: 'AbC' })]
    expect(searchNodes(nodes, 'abc')).toHaveLength(1)
  })

  it('搜索多行全文（命中非首行）', () => {
    const nodes = [makeNode({ id: 'a', text: '标题\n正文含关键字' })]
    const res = searchNodes(nodes, '关键字')
    expect(res).toHaveLength(1)
    expect(res[0].body).not.toBeNull()
  })

  it('空 / 全空白 query 返回空数组', () => {
    const nodes = [makeNode({ id: 'a', text: 'abc' })]
    expect(searchNodes(nodes, '')).toEqual([])
    expect(searchNodes(nodes, '   ')).toEqual([])
  })

  it('无匹配返回空数组', () => {
    const nodes = [makeNode({ id: 'a', text: 'abc' })]
    expect(searchNodes(nodes, 'xyz')).toEqual([])
  })

  it("默认 scope 保持 'project' 全项目行为", () => {
    const nodes = [
      makeNode({ id: 'root', text: '项目名', parentId: null }),
      makeNode({ id: 'a', text: '需求分析' }),
      makeNode({ id: 'b', text: '别的需求' }),
    ]
    // 未传 options 时默认全项目（排除根节点）
    const res = searchNodes(nodes, '需求')
    expect(res.map((r) => r.nodeId)).toEqual(['a', 'b'])
  })

  it("scope='view' 时只返回当前视图直接子级", () => {
    // 三级树：root 下 a 和 b，a 下 c
    const nodes = [
      makeNode({ id: 'root', text: '项目名', parentId: null }),
      makeNode({ id: 'a', text: '甲级节点' }),
      makeNode({ id: 'b', text: '乙级节点' }),
      makeNode({ id: 'c', text: '丙级节点', parentId: 'a' }),
    ]
    // project 范围：能命中全部非根节点
    const projectRes = searchNodes(nodes, '节点')
    expect(projectRes.map((r) => r.nodeId)).toEqual(['a', 'b', 'c'])

    // view 范围（viewedNodeId='a'）：只取 a 的直接子级 c 命中，a 与 b 不命中
    const viewRes = searchNodes(nodes, '节点', { scope: 'view', viewedNodeId: 'a' })
    expect(viewRes.map((r) => r.nodeId)).toEqual(['c'])
  })
})