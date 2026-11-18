// src/mcp/__tests__/viewText.test.ts —— MCP 专用视图转文本（直线命中）单测
// 含对照用例：同一节点集跑插件版 buildViewText('lineHit') 与 MCP 版，断言行分组一致（§4.5 等价性锁定）。
// 该对照 import plugins/ 是测试专用例外（不出现在生产 bundle）。
import { describe, expect, it } from 'vitest'
import { buildViewRowsText, lineHitRows, type McpViewNode } from '../viewText'
// 对照用例 import plugins/ 是测试专用例外（不出现在生产 bundle，不引入宿主→插件运行时依赖）
import { buildViewText } from '../../../plugins/ai/utils/viewText'

function node(id: string, x: number, y: number, width = 200, height = 100, text = id): McpViewNode {
  return { id, x, y, width, height, text }
}

describe('lineHitRows（行分组）', () => {
  it('空输入返回空', () => {
    expect(lineHitRows([])).toEqual([])
  })

  it('单行：同一水平线的节点聚为一行', () => {
    const rows = lineHitRows([node('a', 0, 0), node('b', 300, 10)])
    expect(rows).toHaveLength(1)
    // 行内按 x 升序
    expect(rows[0].map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('多行：不同高度分列', () => {
    const rows = lineHitRows([node('top', 0, 0), node('bottom', 0, 300)])
    expect(rows).toHaveLength(2)
    expect(rows[0].map((n) => n.id)).toEqual(['top'])
    expect(rows[1].map((n) => n.id)).toEqual(['bottom'])
  })

  it('微小错位仍同行（yThreshold 去重中心）', () => {
    const rows = lineHitRows([node('a', 0, 0), node('b', 300, 5)])
    expect(rows).toHaveLength(1)
    expect(rows[0].map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('空行跳过：没有节点命中的搜索线不产生空行', () => {
    const rows = lineHitRows([node('a', 0, 0), node('b', 0, 1000)])
    expect(rows).toHaveLength(2)
  })
})

describe('buildViewRowsText（格式化与截断）', () => {
  it('文本行间 \\n、行内 " | "，includeIds 单元格带 [id] 前缀', () => {
    const r = buildViewRowsText([node('a', 0, 0, 200, 100, '第一行\n第二行'), node('b', 300, 0, 200, 100, 'B')], {
      includeIds: true,
      includeCoordinates: false,
      maxNodes: 300,
    })
    expect(r.rows).toEqual([
      { index: 0, nodeIds: ['a', 'b'] },
    ])
    expect(r.text).toBe('[a] 第一行 | [b] B')
    expect(r.truncated).toBe(false)
  })

  it('includeIds=false 去掉 id 前缀；includeCoordinates 加坐标', () => {
    const nodes = [node('a', 10, 20)]
    const plain = buildViewRowsText(nodes, { includeIds: false, includeCoordinates: false, maxNodes: 300 })
    expect(plain.text).toBe('a')
    const coords = buildViewRowsText(nodes, { includeIds: false, includeCoordinates: true, maxNodes: 300 })
    expect(coords.text).toBe('[10,20] a')
    const both = buildViewRowsText(nodes, { includeIds: true, includeCoordinates: true, maxNodes: 300 })
    expect(both.text).toBe('[a] [10,20] a')
  })

  it('maxNodes 截断：超出部分丢弃并置 truncated', () => {
    const r = buildViewRowsText([node('a', 0, 0), node('b', 0, 500)], {
      includeIds: true,
      includeCoordinates: false,
      maxNodes: 1,
    })
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].nodeIds).toEqual(['a'])
    expect(r.truncated).toBe(true)
  })
})

describe('与插件版 buildViewText(lineHit) 的对照（行分组一致性）', () => {
  /** 插件版输出（默认参数：yThreshold=10, offset=0, overlapRatio=0.5, separator='\t'）→ 每行节点 id 列表 */
  function pluginRows(nodes: McpViewNode[]): string[][] {
    // 节点 text=id（首行唯一），单元格即 id；标题不传
    const text = buildViewText(nodes, 'lineHit', {})
    if (text.trim() === '') return []
    return text.split('\n').map((line) => line.split('\t'))
  }

  /** MCP 版输出 → 每行节点 id 列表 */
  function mcpRows(nodes: McpViewNode[]): string[][] {
    const r = buildViewRowsText(nodes, { includeIds: false, includeCoordinates: false, maxNodes: 10_000 })
    if (r.text === '') return []
    return r.text.split('\n').map((line) => line.split(' | '))
  }

  const cases: McpViewNode[][] = [
    [],
    [node('a', 0, 0)],
    [node('a', 0, 0), node('b', 300, 5), node('c', 600, 12)],
    [node('a', 0, 0), node('b', 0, 120), node('c', 0, 240)],
    // 上下重叠 → 重复率合并分支
    [node('a', 0, 0), node('b', 300, 40), node('c', 600, 80)],
    // 空文本节点（单元格空串）
    [node('a', 0, 0, 200, 100, ''), node('b', 300, 0)],
    // 多行文本（首行参与展示）
    [node('a', 0, 0, 200, 100, 'A1\nA2'), node('b', 300, 30, 200, 100, 'B1\nB2')],
  ]

  for (const [i, nodes] of cases.entries()) {
    it(`用例 ${i}：行分组一致`, () => {
      expect(mcpRows(nodes)).toEqual(pluginRows(nodes))
    })
  }
})
