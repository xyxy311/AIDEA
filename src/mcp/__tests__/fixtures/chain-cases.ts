/**
 * fixtures/chain-cases.ts —— chainText 六类最小图（plan §10.3）：
 * 线性 / 分支 / 环 / 自环 / 孤立 / 平行多边。确定性：同输入必得同输出。
 */
import type { ChainEdge, ChainNode } from '../../chainText'

/** 确定性 id：seed 补齐 21 位（pad 'z' 避免种子前缀互相吞并，如 s1 与 s10） */
export function fid(seed: string): string {
  return seed.padEnd(21, 'z').slice(0, 21)
}

export interface ChainCase {
  name: string
  nodes: ChainNode[]
  edges: ChainEdge[]
}

/** 构造节点：handle 取 id 3 位前缀（fixture 内保证唯一） */
function mkNode(seed: string, x: number, y: number, label = seed, extra: Partial<ChainNode> = {}): ChainNode {
  return {
    id: fid(seed),
    handle: fid(seed).slice(0, 3),
    label,
    tagNames: [],
    styleName: null,
    x,
    y,
    childCount: 0,
    ...extra,
  }
}

function mkEdge(index: number, from: string, to: string, extra: Partial<ChainEdge> = {}): ChainEdge {
  return { index, fromId: fid(from), toId: fid(to), directed: true, text: null, styleName: null, ...extra }
}

/** 线性：A→B→C */
export function linearCase(): ChainCase {
  return {
    name: 'linear',
    nodes: [mkNode('A', 0, 0), mkNode('B', 200, 0), mkNode('C', 400, 0)],
    edges: [mkEdge(1, 'A', 'B'), mkEdge(2, 'B', 'C')],
  }
}

/** 分支：A→B, A→C（A 为分支点，链在 A 断开） */
export function branchCase(): ChainCase {
  return {
    name: 'branch',
    nodes: [mkNode('A', 0, 0), mkNode('B', 200, -100), mkNode('C', 200, 100)],
    edges: [mkEdge(1, 'A', 'B'), mkEdge(2, 'A', 'C')],
  }
}

/** 环：A→B, B→A（两节点环，pass2 进入，↩回[A] 闭合） */
export function cycleCase(): ChainCase {
  return {
    name: 'cycle',
    nodes: [mkNode('A', 0, 0), mkNode('B', 200, 0)],
    edges: [mkEdge(1, 'A', 'B'), mkEdge(2, 'B', 'A')],
  }
}

/** 自环：A→A */
export function selfLoopCase(): ChainCase {
  return {
    name: 'self-loop',
    nodes: [mkNode('A', 0, 0)],
    edges: [mkEdge(1, 'A', 'A')],
  }
}

/** 孤立：无边 */
export function isolatedCase(): ChainCase {
  return {
    name: 'isolated',
    nodes: [mkNode('A', 0, 0), mkNode('B', 200, 0)],
    edges: [],
  }
}

/** 平行多边：A→B 两条边（各自成链，边覆盖恰好一次） */
export function parallelCase(): ChainCase {
  return {
    name: 'parallel',
    nodes: [mkNode('A', 0, 0), mkNode('B', 200, 0)],
    edges: [mkEdge(1, 'A', 'B'), mkEdge(2, 'A', 'B')],
  }
}

export function allChainCases(): ChainCase[] {
  return [linearCase(), branchCase(), cycleCase(), selfLoopCase(), isolatedCase(), parallelCase()]
}
