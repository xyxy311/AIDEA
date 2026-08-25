import type { TopBarId, TopBarZone } from '@/constants/topbar'

/**
 * 顶部栏布局纯函数（模仿 utils/dock.ts）
 *
 * 统一管理「左顶部条 LeftTopBar」与「右顶部条 RightTopBar」的按钮归属与顺序。
 * 所有状态转换均为纯函数（返回新对象），便于单测与 store 复用。
 *
 * 数据模型：
 * - leftTop：左顶部条按钮顺序
 * - rightTop：右顶部条按钮顺序
 *
 * 约束：一个按钮同一时刻只能归属一侧（left ∪ right = 已放置按钮）。
 *
 * 默认布局（哪些按钮默认放哪侧）由按钮品类表 constants/topbar.ts 的
 * defaultZone 派生，本文件不硬编码任何按钮 id。
 */

/** 顶部栏布局状态 */
export interface TopBarState {
  leftTop: TopBarId[]
  rightTop: TopBarId[]
}

/** 创建默认布局状态 */
export function defaultTopBarState(
  left: TopBarId[],
  right: TopBarId[],
): TopBarState {
  return { leftTop: [...left], rightTop: [...right] }
}

/**
 * 清理并规整顶部栏状态：
 * - 过滤无效 / 重复 id（左右独立去重）
 * - 补充「新增的默认按钮」：defaults 中未出现在任一侧的按钮，按默认侧追加到末尾，
 *   保证新增按钮只需在品类表登记，即可对已有用户自动生效（旧 localStorage 不含新按钮时）。
 */
export function normalizeTopBarState(
  state: TopBarState,
  registry: TopBarId[],
  defaults?: { left: TopBarId[]; right: TopBarId[] },
): TopBarState {
  const valid = new Set<TopBarId>(registry)

  const seenLeft = new Set<TopBarId>()
  const leftTop: TopBarId[] = []
  for (const id of state.leftTop) {
    if (valid.has(id) && !seenLeft.has(id)) {
      seenLeft.add(id)
      leftTop.push(id)
    }
  }

  const seenRight = new Set<TopBarId>()
  const rightTop: TopBarId[] = []
  for (const id of state.rightTop) {
    if (valid.has(id) && !seenRight.has(id)) {
      seenRight.add(id)
      rightTop.push(id)
    }
  }

  if (defaults) {
    const placed = new Set<TopBarId>([...leftTop, ...rightTop])
    for (const id of defaults.left) {
      if (valid.has(id) && !placed.has(id)) {
        leftTop.push(id)
        placed.add(id)
      }
    }
    for (const id of defaults.right) {
      if (valid.has(id) && !placed.has(id)) {
        rightTop.push(id)
        placed.add(id)
      }
    }
  }

  return { leftTop, rightTop }
}

/**
 * 同一侧内换位：把 from 位的按钮移动到 to 位。
 * from === to 时返回原对象。
 */
export function reorderTopCore(
  state: TopBarState,
  zone: TopBarZone,
  from: number,
  to: number,
): TopBarState {
  if (from === to) return state
  const key = zone === 'left' ? 'leftTop' : 'rightTop'
  const list = [...state[key]]
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  return { ...state, [key]: list }
}

/**
 * 把按钮移入目标侧（另一侧移除 + 加入目标侧末尾）。
 * 若按钮已在目标侧则不重复添加。
 */
export function moveTopZoneCore(
  state: TopBarState,
  buttonId: TopBarId,
  toZone: TopBarZone,
): TopBarState {
  const removeOther = toZone === 'left' ? state.rightTop : state.leftTop
  const keep = toZone === 'left' ? state.leftTop : state.rightTop
  const otherZone = removeOther.filter((id) => id !== buttonId)
  const target = keep.includes(buttonId) ? keep : [...keep, buttonId]
  return toZone === 'left'
    ? { leftTop: target, rightTop: otherZone }
    : { leftTop: otherZone, rightTop: target }
}

// ── 统一拖拽协议（全项目一致） ──

/** 顶部栏按钮拖拽 dataTransfer MIME 类型 */
export const TOP_DRAG_MIME = 'aidea-topbar'

/** 顶部栏按钮拖拽数据（跨容器移动时携带） */
export interface TopBarDragData {
  buttonId: TopBarId
  zone: TopBarZone
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