// Dock 布局纯函数（delta 模型）：登记表回答"有哪些面板及默认侧"，用户排布只存显式改动，
// 渲染目录 = deriveDockLayout(登记表, delta) 实时派生；附带统一 HTML5 面板拖拽协议。
import type { PanelKey } from '@/constants/panels'

/** 默认高度比例 */
export const DEFAULT_SIZE = 1

/** 排布派生输入的最小登记形状（uiRegistry 条目的结构子集，utils 不依赖 store） */
export interface PlacementDef {
  key: string
  defaultPlacement: 'left' | 'right'
}

/** dock 用户排布增量（layout store 持久化的全部内容） */
export interface DockDelta {
  /** 左侧用户排布顺序（用户拖拽 / 跨侧移动过才写入）；缺省 = 登记默认顺序 */
  leftOrder?: PanelKey[]
  /** 右侧用户排布顺序；缺省 = 登记默认顺序 */
  rightOrder?: PanelKey[]
  /** 用户关闭（未放置）的面板：派生时排除，活动栏「+」列表来源 */
  removed?: PanelKey[]
  /** 右侧高度比例覆盖（仅用户调过的项） */
  rightSizes?: Record<string, number>
}

/** 派生结果：两侧的面板键顺序 */
export interface DockPlacement {
  left: PanelKey[]
  right: PanelKey[]
}

// ── delta 解析（localStorage → DockDelta，容错脏数据）──

/** 解析字符串数组字段：过滤非字符串 / isKnown 为 false / 重复项 */
function parseSeq(raw: unknown, isKnown: (key: string) => boolean): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || !isKnown(item) || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

/** 解析并清洗 dock delta（读取 localStorage 后调用一次）：形状不符丢弃、未知/重复键过滤（isKnown）、尺寸仅保留正数。 */
export function parseDockDelta(raw: unknown, isKnown: (key: string) => boolean): DockDelta {
  if (typeof raw !== 'object' || raw === null) return {}
  const src = raw as Record<string, unknown>
  const delta: DockDelta = {}
  const left = parseSeq(src.leftOrder, isKnown)
  if (left) delta.leftOrder = left as PanelKey[]
  const right = parseSeq(src.rightOrder, isKnown)
  if (right) delta.rightOrder = right as PanelKey[]
  const removed = parseSeq(src.removed, isKnown)
  if (removed) delta.removed = removed as PanelKey[]
  if (typeof src.rightSizes === 'object' && src.rightSizes !== null) {
    const sizes: Record<string, number> = {}
    for (const [k, v] of Object.entries(src.rightSizes as Record<string, unknown>)) {
      if (isKnown(k) && typeof v === 'number' && v > 0) sizes[k] = v
    }
    if (Object.keys(sizes).length > 0) delta.rightSizes = sizes
  }
  return delta
}

// ── 排布派生（delta + 登记表 → 实时目录）──

/** 有序并集：base 中属于 pool 的项按 base 序在前，pool 其余项按 pool 序追加在后 */
function orderedUnion(base: string[] | undefined, pool: string[]): string[] {
  const poolSet = new Set(pool)
  const seq: string[] = []
  const seen = new Set<string>()
  if (base) {
    for (const key of base) {
      if (poolSet.has(key) && !seen.has(key)) {
        seen.add(key)
        seq.push(key)
      }
    }
  }
  for (const key of pool) {
    if (!seen.has(key)) seq.push(key)
  }
  return seq
}

/**
 * 派生两侧实时目录：归属按 rightOrder/leftOrder 命中优先于 defaultPlacement（同现时右优先），
 * removed 中的面板排除；顺序 = 该侧用户顺序优先，未覆盖的按登记顺序追加。
 */
export function deriveDockLayout(defs: PlacementDef[], delta: DockDelta): DockPlacement {
  const removed = new Set<string>(delta.removed ?? [])

  const leftPool: string[] = []
  const rightPool: string[] = []
  for (const def of defs) {
    if (removed.has(def.key)) continue
    const inRight = delta.rightOrder?.includes(def.key as PanelKey) ?? false
    const inLeft = delta.leftOrder?.includes(def.key as PanelKey) ?? false
    const placement = inRight ? 'right' : inLeft ? 'left' : def.defaultPlacement
    if (placement === 'right') rightPool.push(def.key)
    else leftPool.push(def.key)
  }

  return {
    left: orderedUnion(delta.leftOrder, leftPool) as PanelKey[],
    right: orderedUnion(delta.rightOrder, rightPool) as PanelKey[],
  }
}

// ── 顺序纯操作（layout store 写 delta 用）──

/** 序列内换位：把 from 位移动到 to 位（越界钳制；from === to 返回原数组）。dock 面板与顶栏按钮 reorder 共用。 */
export function reorderSeq<T>(seq: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= seq.length) return seq
  const next = [...seq]
  const clamped = Math.max(0, Math.min(to, next.length - 1))
  const [moved] = next.splice(from, 1)
  next.splice(clamped, 0, moved)
  return next
}

/** 删除尺寸记录（面板被移出右侧时） */
export function dropSize(sizes: Record<string, number>, panelId: string): Record<string, number> {
  if (!(panelId in sizes)) return { ...sizes }
  const next = { ...sizes }
  delete next[panelId]
  return next
}

// ── 统一拖拽协议（全项目一致） ──

/** 面板拖拽 dataTransfer MIME 类型 */
export const PANEL_DRAG_MIME = 'aidea-panel'

/** 面板拖拽数据（跨容器移动时携带） */
export interface PanelDragData {
  panelId: PanelKey
  from: 'left' | 'right'
}

/** 写入面板拖拽数据到 dataTransfer（容错缺少 dataTransfer） */
export function writePanelDrag(e: { dataTransfer: DataTransfer | null }, data: PanelDragData): void {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(PANEL_DRAG_MIME, JSON.stringify(data))
  }
}

/** 从 dataTransfer 解析面板拖拽数据；解析失败 / 缺失返回 null */
export function readPanelDrag(e: DragEvent): PanelDragData | null {
  const raw = e.dataTransfer?.getData(PANEL_DRAG_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PanelDragData
    if (parsed && typeof parsed.panelId === 'string') return parsed
    return null
  } catch {
    return null
  }
}
