import type { TopBarKey } from '@/constants/topbar'
import { reorderSeq } from './dock'

/**
 * 顶部栏布局纯函数（delta 模型）：登记表提供默认侧，用户排布存显式改动，实时派生两侧按钮目录。
 */

/** 顶栏用户排布增量（layout store 持久化的全部内容） */
export interface TopDelta {
  /** 左顶部条用户排布顺序；缺省 = 登记默认顺序 */
  leftOrder?: TopBarKey[]
  /** 右顶部条用户排布顺序；缺省 = 登记默认顺序 */
  rightOrder?: TopBarKey[]
}

/** 排布派生输入的最小登记形状（uiRegistry 条目的结构子集） */
export interface ZoneDef {
  key: string
  defaultZone: 'left' | 'right'
}

/** 派生结果：两侧的按钮键顺序 */
export interface TopPlacement {
  left: TopBarKey[]
  right: TopBarKey[]
}

// ── delta 解析（localStorage → TopDelta，容错脏数据）──

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

/** 解析并清洗顶栏 delta（读取 localStorage 后调用一次） */
export function parseTopDelta(raw: unknown, isKnown: (key: string) => boolean): TopDelta {
  if (typeof raw !== 'object' || raw === null) return {}
  const src = raw as Record<string, unknown>
  const delta: TopDelta = {}
  const left = parseSeq(src.leftOrder, isKnown)
  if (left) delta.leftOrder = left as TopBarKey[]
  const right = parseSeq(src.rightOrder, isKnown)
  if (right) delta.rightOrder = right as TopBarKey[]
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
 * 派生两侧实时目录：
 * 归属 = 用户顺序命中（右优先）否则 defaultZone；顺序 = 用户顺序优先，其余按登记追加。
 */
export function deriveTopLayout(defs: ZoneDef[], delta: TopDelta): TopPlacement {
  const leftPool: string[] = []
  const rightPool: string[] = []
  for (const def of defs) {
    const inRight = delta.rightOrder?.includes(def.key as TopBarKey) ?? false
    const inLeft = delta.leftOrder?.includes(def.key as TopBarKey) ?? false
    const zone = inRight ? 'right' : inLeft ? 'left' : def.defaultZone
    if (zone === 'right') rightPool.push(def.key)
    else leftPool.push(def.key)
  }

  return {
    left: orderedUnion(delta.leftOrder, leftPool) as TopBarKey[],
    right: orderedUnion(delta.rightOrder, rightPool) as TopBarKey[],
  }
}

// reorderSeq 复用 utils/dock.ts 的通用实现（面板与按钮同一换位语义）

// ── 统一拖拽协议（全项目一致） ──

/** 顶部栏按钮拖拽 dataTransfer MIME 类型 */
export const TOP_DRAG_MIME = 'aidea-topbar'

/** 顶部栏按钮拖拽数据（跨容器移动时携带） */
export interface TopBarDragData {
  buttonId: TopBarKey
  zone: 'left' | 'right'
}

/** 写入顶部栏按钮拖拽数据到 dataTransfer（容错缺少 dataTransfer） */
export function writeTopBarDrag(e: { dataTransfer: DataTransfer | null }, data: TopBarDragData): void {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(TOP_DRAG_MIME, JSON.stringify(data))
  }
}

/** 从 dataTransfer 解析顶部栏按钮拖拽数据；解析失败 / 缺失返回 null */
export function readTopBarDrag(e: DragEvent): TopBarDragData | null {
  const raw = e.dataTransfer?.getData(TOP_DRAG_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as TopBarDragData
    if (parsed && typeof parsed.buttonId === 'string') return parsed
    return null
  } catch {
    return null
  }
}
