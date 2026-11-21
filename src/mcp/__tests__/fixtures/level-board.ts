/**
 * fixtures/level-board.ts —— 体积上限与真实感夹具（plan §10.3）：确定性生成器（固定 seed PRNG）。
 * 153 节点 / 124 边 / 42 行带；含 5 分支点（M10/M25/M40/M55/M70）、2 个有向环（回边 M25→M5、M55→M15）、
 * 6 未连线（U1–U6）、2 个同名节点（M33/M66 → '重名'/'重名(2)'）、2 个含 '→' 的名字（M11/M71）、
 * 1 个 168 字长文本节点（M50，首行截断为 40 + '…'）。
 *
 * 结构：主径 M0→…→M79（79 边）+ 分支叶 B1–B5（5 边）+ 回边（2 边）+
 *       14 条三元链 T*a→T*b→T*c（28 边）+ 10 条二元链 P*a→P*b（10 边）。
 */
import type { ChainEdge, ChainNode } from '../../chainText'
import { assignNodeHandles } from '../../naming'

/** mulberry32：同 seed 同输出（纯确定，I3 的前提） */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NANOID_ALPHABET = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict'

/** 确定性 21 位 id（冲突时顺延重摇，仍确定） */
function makeIdFactory(rand: () => number): () => string {
  const used = new Set<string>()
  return () => {
    for (;;) {
      let s = ''
      for (let i = 0; i < 21; i++) s += NANOID_ALPHABET[Math.floor(rand() * NANOID_ALPHABET.length)]
      if (used.has(s)) continue
      used.add(s)
      return s
    }
  }
}

const LONG_TEXT = '长'.repeat(168)
const LONG_LABEL = `${'长'.repeat(40)}…`

interface Spec {
  seed: string
  label: string
  text?: string
}

/** 节点序（存储序）：主径 → 分支叶 → 三元链 → 二元链 → 未连线 */
function buildSpecs(): Spec[] {
  const specs: Spec[] = []
  for (let i = 0; i < 80; i++) {
    if (i === 11) specs.push({ seed: `M${i}`, label: 'A→B' })
    else if (i === 33) specs.push({ seed: `M${i}`, label: '重名' })
    else if (i === 50) specs.push({ seed: `M${i}`, label: LONG_LABEL, text: LONG_TEXT })
    else if (i === 66) specs.push({ seed: `M${i}`, label: '重名(2)' })
    else if (i === 71) specs.push({ seed: `M${i}`, label: '甲→乙' })
    else specs.push({ seed: `M${i}`, label: `M${i}` })
  }
  for (let i = 1; i <= 5; i++) specs.push({ seed: `B${i}`, label: `B${i}` })
  for (let i = 1; i <= 14; i++) for (const s of ['a', 'b', 'c']) specs.push({ seed: `T${i}${s}`, label: `T${i}${s}` })
  for (let i = 1; i <= 10; i++) for (const s of ['a', 'b']) specs.push({ seed: `P${i}${s}`, label: `P${i}${s}` })
  for (let i = 1; i <= 6; i++) specs.push({ seed: `U${i}`, label: `U${i}` })
  return specs
}

/** 42 行带坐标：行 = 序号 % 42，列 = floor(序号 / 42) % 6 */
function coord(seq: number): { x: number; y: number } {
  return { x: (Math.floor(seq / 42) % 6) * 220, y: (seq % 42) * 120 }
}

export interface LevelBoard {
  nodes: ChainNode[]
  edges: ChainEdge[]
}

export function buildLevelBoard(seed = 20260101): LevelBoard {
  const rand = mulberry32(seed)
  const nextId = makeIdFactory(rand)
  const specs = buildSpecs()
  const ids = specs.map(() => nextId())
  const handles = assignNodeHandles(ids)

  const nodes: ChainNode[] = specs.map((spec, i) => {
    const { x, y } = coord(i)
    const seq = i
    return {
      id: ids[i],
      handle: handles.get(ids[i]) ?? ids[i],
      label: spec.label,
      tagNames: seq % 7 === 3 ? ['主线'] : [],
      styleName: seq % 11 === 5 ? 'Red' : seq % 5 === 2 ? 'Blue' : null,
      x,
      y,
      childCount: seq === 20 ? 3 : seq === 45 ? 2 : 0,
    }
  })
  const idOf = (seed: string): string => ids[specs.findIndex((s) => s.seed === seed)]

  const edgeSeeds: Array<[string, string, Partial<ChainEdge>]> = []
  for (let i = 0; i < 79; i++) edgeSeeds.push([`M${i}`, `M${i + 1}`, {}])
  for (let i = 1; i <= 5; i++) edgeSeeds.push([`M${[10, 25, 40, 55, 70][i - 1]}`, `B${i}`, {}])
  edgeSeeds.push(['M25', 'M5', {}], ['M55', 'M15', {}])
  for (let i = 1; i <= 14; i++) {
    edgeSeeds.push([`T${i}a`, `T${i}b`, {}], [`T${i}b`, `T${i}c`, {}])
  }
  for (let i = 1; i <= 10; i++) edgeSeeds.push([`P${i}a`, `P${i}b`, {}])

  const edges: ChainEdge[] = edgeSeeds.map(([from, to, extra], i) => ({
    index: i + 1,
    fromId: idOf(from),
    toId: idOf(to),
    directed: true,
    text: i % 13 === 4 ? '传递' : null,
    styleName: i % 9 === 6 ? 'Red Dashed' : null,
    ...extra,
  }))

  return { nodes, edges }
}

/** 夹具字典行（近似真实预设全量的渲染结果） */
export const LEVEL_BOARD_DICTS = {
  styleDict: 'Default=#7d7d7d | Blue=#3b82f6 | Green=#22c55e | Yellow=#eab308 | Red=#ef4444 | Purple=#a855f7 | Pink=#ec4899',
  linkDict: 'Default=solid#6b7280 单向 | Blue Arrow=solid#3b82f6 单向 | Red Dashed=dashed#ef4444 单向 | Green Plain=solid#22c55e 双向 | Gray Dotted=dotted#9ca3af 双向',
  tagDict: '主线 | 注释',
}
