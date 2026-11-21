// src/mcp/__tests__/chainText.test.ts —— 链分解与链式文本：六类夹具 / 四条不变式 / 边段四态 / 分页与过滤
import { describe, expect, it } from 'vitest'
import {
  buildViewChainText,
  decomposeChains,
  renderEdge,
  type ChainEdge,
  type ChainNode,
  type ViewChainOpts,
} from '../chainText'
import { allChainCases, fid, type ChainCase } from './fixtures/chain-cases'
import { project19Edges, project19Nodes } from './fixtures/project-19'
import { LEVEL_BOARD_DICTS, buildLevelBoard } from './fixtures/level-board'

const DEFAULT_OPTS: ViewChainOpts = {
  includeCoords: true,
  includeTags: true,
  includeStyles: true,
  unlinkedLimit: 20,
  maxChains: 40,
}

function dicts() {
  return { styleDict: 'Blue=#3b82f6', linkDict: 'Red Dashed=dashed#ef4444 单向', tagDict: '主线' }
}

function edgeIndexes(chains: ReturnType<typeof decomposeChains>['chains']): number[] {
  return chains.flatMap((c) => c.edges.map((e) => e.index))
}

describe('decomposeChains —— 六类夹具', () => {
  const cases = allChainCases()

  it('线性：单链 A→B→C', () => {
    const c: ChainCase = cases[0]
    const { chains, unlinked } = decomposeChains(c.nodes, c.edges)
    expect(chains).toHaveLength(1)
    expect(chains[0].nodes.map((n) => n.label)).toEqual(['A', 'B', 'C'])
    expect(chains[0].edges.map((e) => e.index)).toEqual([1, 2])
    expect(chains[0].closedToId).toBeNull()
    expect(unlinked).toHaveLength(0)
  })

  it('分支：分支点断链 → 两条链，各自 endsAtBranch=false，边覆盖 2/2', () => {
    const c: ChainCase = cases[1]
    const { chains } = decomposeChains(c.nodes, c.edges)
    expect(chains).toHaveLength(2)
    expect(edgeIndexes(chains).sort()).toEqual([1, 2])
    for (const chain of chains) expect(chain.nodes.map((n) => n.label)[0]).toBe('A')
  })

  it('环：↩回[A] 闭合，不再追加节点（I2）', () => {
    const c: ChainCase = cases[2]
    const { chains } = decomposeChains(c.nodes, c.edges)
    expect(chains).toHaveLength(1)
    expect(chains[0].nodes.map((n) => n.label)).toEqual(['A', 'B'])
    expect(chains[0].edges).toHaveLength(2)
    expect(chains[0].closedToId).toBe(c.nodes[0].id)
  })

  it('自环：单节点链闭合', () => {
    const c: ChainCase = cases[3]
    const { chains } = decomposeChains(c.nodes, c.edges)
    expect(chains).toHaveLength(1)
    expect(chains[0].nodes.map((n) => n.label)).toEqual(['A'])
    expect(chains[0].closedToId).toBe(c.nodes[0].id)
  })

  it('孤立：无链，两节点均入 unlinked', () => {
    const c: ChainCase = cases[4]
    const { chains, unlinked } = decomposeChains(c.nodes, c.edges)
    expect(chains).toHaveLength(0)
    expect(unlinked.map((n) => n.label)).toEqual(['A', 'B'])
  })

  it('平行多边：两条链各自覆盖一条边（I1）', () => {
    const c: ChainCase = cases[5]
    const { chains } = decomposeChains(c.nodes, c.edges)
    expect(chains).toHaveLength(2)
    expect(edgeIndexes(chains).sort()).toEqual([1, 2])
  })

  it('directed=false 仍按存储 from→to 遍历（§5.1）', () => {
    const nodes: ChainNode[] = cases[0].nodes
    const edges: ChainEdge[] = [{ index: 1, fromId: nodes[0].id, toId: nodes[1].id, directed: false, text: null, styleName: null }]
    const { chains } = decomposeChains(nodes, edges)
    expect(chains[0].nodes.map((n) => n.label)).toEqual(['A', 'B'])
  })

  it('端点缺失的边被跳过（防御，不影响其余边覆盖）', () => {
    const c = cases[0]
    const dangling: ChainEdge = { index: 3, fromId: 'missing', toId: c.nodes[0].id, directed: true, text: null, styleName: null }
    const { chains } = decomposeChains(c.nodes, [...c.edges, dangling])
    expect(edgeIndexes(chains)).toEqual([1, 2])
  })
})

describe('project-19 回归基线（§0.3 / §5.1 实测）', () => {
  const nodes = project19Nodes()
  const edges = project19Edges()
  const result = decomposeChains(nodes, edges)

  it('链 10 条，链长 {5,4,3,3,3,3,3,2,2,2}', () => {
    expect(result.chains).toHaveLength(10)
    const lengths = result.chains.map((c) => c.nodes.length).sort((a, b) => b - a)
    expect(lengths).toEqual([5, 4, 3, 3, 3, 3, 3, 2, 2, 2])
  })

  it('边覆盖 20/20（I1：全部连线恰好一次）', () => {
    const idx = edgeIndexes(result.chains)
    expect(idx).toHaveLength(20)
    expect([...idx].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })

  it('闭环标记 0 次（环跨链闭合）；孤立 2 个', () => {
    expect(result.chains.every((c) => c.closedToId === null)).toBe(true)
    expect(result.unlinked.map((n) => n.label)).toEqual(['U1', 'U2'])
  })

  it('分支点断链生效（4 条链 endsAtBranch）', () => {
    expect(result.chains.filter((c) => c.endsAtBranch)).toHaveLength(4)
  })

  it('I3：同一数据两次分解输出一致', () => {
    const again = decomposeChains(project19Nodes(), project19Edges())
    expect(again).toEqual(result)
  })

  it('排序：链长降序 → 链首 (y,x) → 链首句柄', () => {
    const lengths = result.chains.map((c) => c.nodes.length)
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a))
    for (let i = 1; i < lengths.length; i++) {
      if (lengths[i - 1] !== lengths[i]) continue
      const a = result.chains[i - 1].nodes[0]
      const b = result.chains[i].nodes[0]
      expect(a.y).toBeLessThanOrEqual(b.y)
    }
  })
})

describe('renderEdge —— 边段四态矩阵（D5）', () => {
  const base = { index: 12, fromId: 'a', toId: 'b', directed: true, text: null, styleName: null }

  it('无文字、默认样式 → --C12-->', () => {
    expect(renderEdge(base, { includeStyles: true })).toBe('--C12-->')
  })

  it('只有文字 → --C12 开门准备-->', () => {
    expect(renderEdge({ ...base, text: '开门准备' }, { includeStyles: true })).toBe('--C12 开门准备-->')
  })

  it('只有样式（前导 | 占位）→ --C12 | Red Dashed-->', () => {
    expect(renderEdge({ ...base, styleName: 'Red Dashed' }, { includeStyles: true })).toBe('--C12 | Red Dashed-->')
  })

  it('两者都有 → --C12 开门准备 | Red Dashed-->', () => {
    expect(renderEdge({ ...base, text: '开门准备', styleName: 'Red Dashed' }, { includeStyles: true })).toBe('--C12 开门准备 | Red Dashed-->')
  })

  it('未命中预设回退紧凑原始值；includeStyles=false 去样式槽', () => {
    expect(renderEdge({ ...base, styleName: 'dashed#ef4444' }, { includeStyles: true })).toBe('--C12 | dashed#ef4444-->')
    expect(renderEdge({ ...base, styleName: 'Red Dashed' }, { includeStyles: false })).toBe('--C12-->')
  })

  it('无向边 → -- 结尾（样式槽照常）', () => {
    expect(renderEdge({ ...base, directed: false, styleName: 'Green Plain' }, { includeStyles: true })).toBe('--C12 | Green Plain--')
    expect(renderEdge({ ...base, directed: false }, { includeStyles: true })).toBe('--C12--')
  })
})

/** 5 节点线性链（过滤测试用） */
function chain5() {
  const mk = (seed: string, x: number): ChainNode => ({
    id: fid(seed),
    handle: fid(seed).slice(0, 3),
    label: seed,
    tagNames: [],
    styleName: null,
    x,
    y: 0,
    childCount: 0,
  })
  const nodes = [mk('KA', 0), mk('KB', 100), mk('KC', 200), mk('KD', 300), mk('KE', 400)]
  const edges: ChainEdge[] = [1, 2, 3, 4].map((i) => ({
    index: i,
    fromId: nodes[i - 1].id,
    toId: nodes[i].id,
    directed: true,
    text: null,
    styleName: null,
  }))
  return { nodes, edges }
}

describe('buildViewChainText —— 版式 / 分页 / 过滤 / 体积', () => {
  it('project-19：I1 边覆盖 + I3 逐字节相同 + 环跨链呈现', () => {
    const input = {
      titlePath: '/测试',
      childCount: 19,
      connectionCount: 20,
      chains: decomposeChains(project19Nodes(), project19Edges()).chains,
      unlinked: decomposeChains(project19Nodes(), project19Edges()).unlinked,
      ...dicts(),
    }
    const a = buildViewChainText(input, DEFAULT_OPTS)
    const b = buildViewChainText(
      { ...input, chains: decomposeChains(project19Nodes(), project19Edges()).chains, unlinked: decomposeChains(project19Nodes(), project19Edges()).unlinked },
      DEFAULT_OPTS,
    )
    expect(a.text).toBe(b.text)
    expect(a.truncated).toBe(false)
    expect(a.nextAfter).toBeNull()
    expect(a.text).toContain('VIEW /测试  19 子节点 · 20 连线 · 链 10 · 未连线 2')
    expect(a.text).toContain('UNLINKED')
    expect(a.text).toContain('STYLE ')
    expect(a.text).toContain('LINK  ')
    expect(a.text).toContain('TAGS  ')
  })

  it('环夹具：闭合链渲染 ↩回[名]', () => {
    const c = allChainCases()[2]
    const { chains } = decomposeChains(c.nodes, c.edges)
    const out = buildViewChainText(
      { titlePath: '/环', childCount: 2, connectionCount: 2, chains, unlinked: [], ...dicts() },
      DEFAULT_OPTS,
    )
    expect(out.text).toContain('--C2-->↩回[A]')
  })

  it('cell 首次全量、再次短式（D0-a）；(+K) 子视图标记', () => {
    const nodes: ChainNode[] = allChainCases()[0].nodes.map((n, i) => ({
      ...n,
      label: i === 0 ? '容器' : n.label,
      childCount: i === 0 ? 3 : 0,
      tagNames: i === 0 ? ['主线'] : [],
      styleName: i === 0 ? 'Blue' : null,
    }))
    const { chains } = decomposeChains(nodes, allChainCases()[0].edges)
    const out = buildViewChainText(
      { titlePath: '/x', childCount: 3, connectionCount: 2, chains, unlinked: [], ...dicts() },
      DEFAULT_OPTS,
    )
    // 首次出现：全量 cell（句柄 + 名 + (+K) + 标签 | 样式 | 坐标）
    expect(out.text).toContain('[NAzz 容器 (+3) | 主线 | Blue | @0,0]')
    // 单次出现的节点也是全量 cell（短式只用于重复出现）
    expect(out.text).toContain('[NBzz B | @200,0]')
  })

  it('跨链重复节点：第二次出现渲染短式 [名]（D0-a）', () => {
    const c = allChainCases()[5] // parallel：A→B 两条边
    const { chains } = decomposeChains(c.nodes, c.edges)
    const out = buildViewChainText(
      { titlePath: '/x', childCount: 2, connectionCount: 2, chains, unlinked: [], ...dicts() },
      DEFAULT_OPTS,
    )
    // 第一条链全量；第二条链两端均为重复 → 短式
    expect(out.text).toContain('[NAzz A | @0,0]--C1-->[NBzz B | @200,0]')
    expect(out.text).toContain('[A]--C2-->[B]')
  })

  it('maxChains 分页：truncated + nextAfter 回传；after 续页', () => {
    const c = allChainCases()[1] // branch：2 条链
    const { chains } = decomposeChains(c.nodes, c.edges)
    const input = { titlePath: '/x', childCount: 3, connectionCount: 2, chains, unlinked: [], ...dicts() }
    const page1 = buildViewChainText(input, { ...DEFAULT_OPTS, maxChains: 1 })
    expect(page1.truncated).toBe(true)
    expect(page1.nextAfter).toBe(1)
    expect(page1.text).toContain('after=1')
    const page2 = buildViewChainText(input, { ...DEFAULT_OPTS, maxChains: 1, after: 1 })
    expect(page2.truncated).toBe(false)
    expect(page2.text).not.toContain('after=')
  })

  it('filter：命中链保留 ±1 跳（5 节点链命中中间 → 掐头去尾），未命中链整体隐藏', () => {
    const { nodes, edges } = chain5()
    const { chains, unlinked } = decomposeChains(nodes, edges)
    const out = buildViewChainText(
      { titlePath: '/x', childCount: 5, connectionCount: 4, chains, unlinked, ...dicts() },
      { ...DEFAULT_OPTS, filter: 'C' },
    )
    expect(out.text).toContain('[NKBz KB | @100,0]--C2-->[NKCz KC | @200,0]--C3-->[NKDz KD | @300,0]')
    expect(out.text).not.toContain('[NKAz KA')
    expect(out.text).not.toContain('[NKEz KE')
  })

  it('unlinkedLimit 折叠', () => {
    const c = allChainCases()[4]
    const { unlinked } = decomposeChains(c.nodes, c.edges)
    const out = buildViewChainText(
      { titlePath: '/x', childCount: 2, connectionCount: 0, chains: [], unlinked, ...dicts() },
      { ...DEFAULT_OPTS, unlinkedLimit: 1 },
    )
    expect(out.text).toContain('…(+1 未连线节点)')
  })

  it('153 节点关卡夹具：边覆盖 124/124、体积 ≤ 8000 字符 / ≤ 120 行（G1）', () => {
    const board = buildLevelBoard()
    const { chains, unlinked } = decomposeChains(board.nodes, board.edges)
    const idx = edgeIndexes(chains)
    expect(idx).toHaveLength(124)
    expect([...idx].sort((a, b) => a - b)).toEqual(Array.from({ length: 124 }, (_, i) => i + 1))
    expect(unlinked).toHaveLength(6)

    const out = buildViewChainText(
      {
        titlePath: '/关卡',
        childCount: 153,
        connectionCount: 124,
        chains,
        unlinked,
        ...LEVEL_BOARD_DICTS,
      },
      DEFAULT_OPTS,
    )
    const lines = out.text.split('\n')
    expect(out.text.length).toBeLessThanOrEqual(8000)
    expect(lines.length).toBeLessThanOrEqual(120)
    expect(out.truncated).toBe(false)
    // 含 → 的名字与长文本节点照常渲染
    expect(out.text).toContain('A→B')
    expect(out.text).toContain('甲→乙')
    expect(out.text).toContain(`${'长'.repeat(40)}…`)
    expect(out.text).toContain('重名(2)')
  })
})
