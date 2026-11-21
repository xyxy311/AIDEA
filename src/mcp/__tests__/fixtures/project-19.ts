/**
 * fixtures/project-19.ts —— 算法回归基线（plan §0.3 第二个项目的手录拓扑）：
 * 19 节点 / 20 边 / 5 分支点（B1–B5，出度 2）/ 2 个有向环（跨链闭合）/ 2 孤立（U1,U2）。
 * 期望：链 10 条、链长 {5,4,3,3,3,3,3,2,2,2}、边覆盖 20/20、闭环标记 0 次、跨链重复节点 7/19。
 *
 * 拓扑（边按存储顺序编号 e1–e20）：
 *   e1  B1→S1   e2  S1→S2  e3  S2→S3  e4  S3→L1
 *   e5  B2→S4   e6  S4→S5  e7  S5→B3
 *   e8  B3→S6   e9  S6→B4
 *   e10 B4→S7   e11 S7→B5
 *   e12 B5→S8   e13 S8→B1
 *   e14 B1→S9   e15 S9→B4
 *   e16 B4→S10  e17 S10→L2
 *   e18 B5→B2   e19 B2→L1   e20 B3→S10
 * 有向环 1：B3→S6→B4→S7→B5→B2→S4→S5→B3（e8,e9,e10,e11,e18,e5,e6,e7）
 * 有向环 2：B1→S9→B4→S7→B5→S8→B1（e14,e15,e10,e11,e12,e13）
 */
import type { ChainEdge, ChainNode } from '../../chainText'
import { fid } from './chain-cases'

/** 孩子序（pass2 扫描序，决定链生成序；输出排序后确定） */
export const PROJECT_19_ORDER = [
  'B1', 'B2', 'B3', 'B4', 'B5',
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10',
  'L1', 'L2', 'U1', 'U2',
] as const

/** 边（from, to），按存储顺序；index = 数组下标 + 1 */
const EDGE_SEEDS: Array<[string, string]> = [
  ['B1', 'S1'], ['S1', 'S2'], ['S2', 'S3'], ['S3', 'L1'],
  ['B2', 'S4'], ['S4', 'S5'], ['S5', 'B3'],
  ['B3', 'S6'], ['S6', 'B4'],
  ['B4', 'S7'], ['S7', 'B5'],
  ['B5', 'S8'], ['S8', 'B1'],
  ['B1', 'S9'], ['S9', 'B4'],
  ['B4', 'S10'], ['S10', 'L2'],
  ['B5', 'B2'], ['B2', 'L1'],
  ['B3', 'S10'],
]

export function project19Nodes(): ChainNode[] {
  return PROJECT_19_ORDER.map((seed, i) => ({
    id: fid(seed),
    handle: fid(seed).slice(0, 3),
    label: seed,
    tagNames: [],
    styleName: null,
    x: 0,
    y: i * 100,
    childCount: 0,
  }))
}

export function project19Edges(): ChainEdge[] {
  return EDGE_SEEDS.map(([from, to], i) => ({
    index: i + 1,
    fromId: fid(from),
    toId: fid(to),
    directed: true,
    text: null,
    styleName: null,
  }))
}
