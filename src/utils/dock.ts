import type { PanelId, PanelKey } from '@/constants/panels'

/**
 * Dock 布局纯函数
 *
 * 统一管理「左侧活动栏」与「右侧多面板 dock」的面板归属与顺序。
 * 所有状态转换均为纯函数（返回新对象），便于单测与 store 复用。
 *
 * 数据模型：
 * - leftPanels：左侧活动栏面板顺序（单面板区，激活显示 activePanelId）
 * - rightPanels：右侧 dock 面板顺序（多面板，垂直堆叠）
 * - rightSizes：右侧各面板的高度比例（flex-grow），key=panelId
 *
 * 约束：一个面板同一时刻只能归属于一侧（left ∪ right = 已放置面板）。
 *
 * 默认布局（哪些面板默认放哪侧）由面板品类表 constants/panels.ts 的
 * defaultPlacement 派生，本文件不硬编码任何面板 id。
 *
 * 面板键：内置面板用 PanelId；插件面板用 `${pluginId}:${id}`（PanelKey 联合）。
 * 归一化对插件 key 的合法性由 opts.isExtraValid 判定（pluginId 前缀 ∈ 已发现插件集合），
 * 保证「禁用→启用」循环不丢布局记录，仅「彻底移除插件」才清除。
 */

/** Dock 侧标识 */
export type DockId = 'left' | 'right'

/** Dock 布局状态 */
export interface DockState {
  leftPanels: PanelKey[]
  rightPanels: PanelKey[]
  rightSizes: Record<string, number>
}

/** 默认高度比例 */
export const DEFAULT_SIZE = 1

/**
 * 创建默认布局状态。
 * @param leftPanels 左侧活动栏默认面板顺序（来自品类表 DEFAULT_LEFT_PANELS）
 * @param rightPanels 右侧 dock 默认面板顺序（来自品类表 DEFAULT_RIGHT_PANELS）
 */
export function defaultDockState(
  leftPanels: PanelId[],
  rightPanels: PanelId[],
): DockState {
  return {
    leftPanels: [...leftPanels],
    rightPanels: [...rightPanels],
    rightSizes: defaultRightSizes(rightPanels),
  }
}

/** 计算右侧默认尺寸：与 rightPanels 一一对应 */
export function defaultRightSizes(rightPanels: PanelId[]): Record<string, number> {
  const sizes: Record<string, number> = {}
  for (const id of rightPanels) sizes[id] = DEFAULT_SIZE
  return sizes
}

/** 有效 id 集（用于过滤脏数据） */
function validSet(registry: PanelKey[]): Set<PanelKey> {
  return new Set(registry)
}

/** 默认布局（用于补充新增面板；仅含内置面板，插件面板走 ensurePanel） */
export interface DockDefaults {
  left: PanelId[]
  right: PanelId[]
}

/** 归一化额外选项 */
export interface NormalizeDockOptions {
  /**
   * 额外合法性判定：返回 true 时该 id 视为有效（即使不在 registry 内）。
   * 用于插件面板 key（`${pluginId}:${id}`）：只要其 pluginId 前缀仍在
   * 「已发现插件」集合中即保留布局记录（禁用→启用循环不丢位置）。
   */
  isExtraValid?: (id: string) => boolean
}

/**
 * 清理并规整 dock 状态：
 * - 过滤无效 / 重复 id（插件 key 经 opts.isExtraValid 判定）
 * - 保证互斥：同一面板出现在两侧时，优先保留在右侧
 * - 补齐缺失的尺寸记录
 * - 补充「新增的默认面板」：defaults 中未出现在任一侧的面板，按默认侧追加到末尾。
 *   保证新增面板只需在品类表登记，即可对已有用户自动生效（旧 localStorage 不含新面板时）。
 *   注意：defaults 仅含内置面板；插件面板的首次落位由 layout.ensurePanel 负责。
 */
export function normalizeDockState(
  state: DockState,
  registry: PanelKey[],
  defaults?: DockDefaults,
  opts?: NormalizeDockOptions,
): DockState {
  const valid = validSet(registry)
  const isValid = (id: PanelKey): boolean =>
    valid.has(id) || (opts?.isExtraValid?.(id) === true)

  // 右侧优先：记录右侧出现的 id
  const rightSeen = new Set<PanelKey>()
  const rightPanels: PanelKey[] = []
  for (const id of state.rightPanels) {
    if (isValid(id) && !rightSeen.has(id)) {
      rightSeen.add(id)
      rightPanels.push(id)
    }
  }

  // 左侧：排除无效与已在右侧重复的面板
  const leftSeen = new Set<PanelKey>()
  const leftPanels: PanelKey[] = []
  for (const id of state.leftPanels) {
    if (isValid(id) && !rightSeen.has(id) && !leftSeen.has(id)) {
      leftSeen.add(id)
      leftPanels.push(id)
    }
  }

  // 尺寸：仅保留已放置面板，缺失用默认值补齐
  const rightSizes: Record<string, number> = {}
  for (const id of rightPanels) {
    const v = state.rightSizes?.[id]
    rightSizes[id] = typeof v === 'number' && v > 0 ? v : DEFAULT_SIZE
  }

  // 补充新增的默认面板（未出现在任一侧时，按默认侧追加；仅内置 id 参与）
  if (defaults) {
    const placed = new Set<PanelKey>([...leftPanels, ...rightPanels])
    for (const id of defaults.left) {
      if (valid.has(id) && !placed.has(id)) {
        leftPanels.push(id)
        placed.add(id)
      }
    }
    for (const id of defaults.right) {
      if (valid.has(id) && !placed.has(id)) {
        rightPanels.push(id)
        placed.add(id)
        rightSizes[id] = DEFAULT_SIZE
      }
    }
  }

  return { leftPanels, rightPanels, rightSizes }
}

/**
 * 把面板移入左侧（右侧移除 + 加入左侧末尾）。
 * 若面板已在左侧，则不重复添加。
 */
export function moveToLeftCore(state: DockState, panelId: PanelKey): DockState {
  const rightPanels = state.rightPanels.filter((id) => id !== panelId)
  const leftPanels = state.leftPanels.includes(panelId)
    ? state.leftPanels
    : [...state.leftPanels, panelId]
  return { ...state, leftPanels, rightPanels, rightSizes: dropSize(state.rightSizes, panelId) }
}

/**
 * 把面板移入右侧（左侧移除 + 加入右侧指定位置）。
 * 若面板已在右侧，则视为在右侧内 reorder。
 * @param toIndex 目标位置；越界时追加到末尾
 */
export function moveToRightCore(
  state: DockState,
  panelId: PanelKey,
  toIndex: number,
): DockState {
  const leftPanels = state.leftPanels.filter((id) => id !== panelId)
  const rightPanels = state.rightPanels.filter((id) => id !== panelId)
  const clamped = Math.max(0, Math.min(toIndex, rightPanels.length))
  rightPanels.splice(clamped, 0, panelId)
  const rightSizes = { ...state.rightSizes }
  if (!(panelId in rightSizes)) rightSizes[panelId] = DEFAULT_SIZE
  return { leftPanels, rightPanels, rightSizes }
}

/** 右侧 dock 内换位 */
export function reorderRightCore(state: DockState, from: number, to: number): DockState {
  if (from === to) return state
  const rightPanels = [...state.rightPanels]
  const [moved] = rightPanels.splice(from, 1)
  rightPanels.splice(to, 0, moved)
  return { ...state, rightPanels }
}

/** 从两侧移除面板（回到未放置状态） */
export function removePanelCore(state: DockState, panelId: PanelKey): DockState {
  const leftPanels = state.leftPanels.filter((id) => id !== panelId)
  const rightPanels = state.rightPanels.filter((id) => id !== panelId)
  return { ...state, leftPanels, rightPanels, rightSizes: dropSize(state.rightSizes, panelId) }
}

/** 设置右侧某面板的高度比例 */
export function setRightSizeCore(
  state: DockState,
  panelId: PanelKey,
  flex: number,
): DockState {
  const size = Math.max(0.1, flex)
  return { ...state, rightSizes: { ...state.rightSizes, [panelId]: size } }
}

/** 删除尺寸记录（面板被移出右侧时） */
function dropSize(sizes: Record<string, number>, panelId: PanelKey): Record<string, number> {
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
