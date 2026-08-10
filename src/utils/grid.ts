/**
 * 网格模式 - 纯函数层
 *
 * 背景语义：
 * - G = 100px（世界坐标），是网格模式下节点坐标与尺寸的最小单位。
 * - 节点坐标/尺寸必须是 G 的整数倍（对齐：尺寸向上取整百，位置四舍五入）。
 * - 活动网格 = G×G 单元格，其中心 = 焦点，焦点坐标是单元格中心（G/2 + G·n，即 50, 150, 250…）。
 *
 * 本文件只包含纯函数与类型，不依赖 store，便于单测与复用。
 */
import { GRID_G } from '@/constants'
import type { WhiteboardNode } from '@/types'

/** 方向：上下左右 */
export type GridDirection = 'up' | 'down' | 'left' | 'right'

/** 节点位置/尺寸最小子集（用于网格几何判定，避免强依赖完整 WhiteboardNode） */
export interface GridNode {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/** findNodeAtCell 的入参：节点列表 + 待判定世界坐标点 */
export interface FindNodeAtCellOptions {
  nodes: GridNode[]
  x: number
  y: number
}

/**
 * 位置吸附：四舍五入到最近的 G 网格点。
 * 注意：JS `Math.round` 对 .5 向 +∞ 取整，负数 G/2 边界（如 -50）会偏向 0。
 */
export function snapPosition(v: number): number {
  return Math.round(v / GRID_G) * GRID_G
}

/**
 * 焦点吸附：任意世界坐标吸附到最近的单元格中心（G/2 + G·n，即 50, 150, 250…）。
 * 焦点 = 活动网格（G×G 单元格）的中心，唯一落在单元格中心（而非任意 G/2 倍数）。
 */
export function snapFocus(v: number): number {
  return Math.round((v - GRID_G / 2) / GRID_G) * GRID_G + GRID_G / 2
}

/**
 * 尺寸吸附：向上取整到 G 的整数倍。
 */
export function snapSize(v: number): number {
  return Math.ceil(v / GRID_G) * GRID_G
}

/**
 * 世界坐标 → 网格单元索引（向下取整），用于碰撞/邻近判定。
 */
export function worldToGrid(v: number): number {
  return Math.floor(v / GRID_G)
}

/**
 * 网格单元索引 → 世界坐标（该单元左上角）。
 */
export function gridToWorld(g: number): number {
  return g * GRID_G
}

/**
 * 网格单元索引 → 世界坐标（该单元中心，即焦点）。
 * 焦点坐标是单元格中心（G/2 + G·n）。
 */
export function cellCenterToWorld(g: number): number {
  return g * GRID_G + GRID_G / 2
}

/**
 * 判断某世界坐标点落在哪个节点矩形内（含边）。
 * 返回命中的节点 id；无命中返回 null。
 */
export function findNodeAtCell(opts: FindNodeAtCellOptions): string | null {
  const { nodes, x, y } = opts
  for (const node of nodes) {
    if (x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height) {
      return node.id
    }
  }
  return null
}

/**
 * 在指定方向从 (fromX, fromY) 出发，找"该方向上最近的节点"（按投影距离最小）。
 * 要求：
 * - 节点必须位于该方向的半平面内（right：节点左边界 > fromX；left：节点右边界 < fromX；等）。
 * - 与该方向正交的投影：焦点在该方向的正交投影落在节点投影区间内（点-区间，非区间-区间），
 *   避免选中斜向太偏的节点。
 * 返回完整节点对象；无满足条件的节点返回 null。
 */
export function nearestNodeInDirection(
  nodeList: WhiteboardNode[],
  fromX: number,
  fromY: number,
  dir: GridDirection,
): WhiteboardNode | null {
  let best: WhiteboardNode | null = null
  let bestDist = Infinity

  for (const node of nodeList) {
    const nodeRight = node.x + node.width
    const nodeBottom = node.y + node.height

    // y 方向是否有重叠（right/left 用）
    const yOverlap = fromY >= node.y && fromY <= nodeBottom
    // x 方向是否有重叠（up/down 用）
    const xOverlap = fromX >= node.x && fromX <= nodeRight

    let projDist: number
    switch (dir) {
      case 'right':
        // 节点左边界严格在 fromX 右侧（半平面），且 y 方向区间重叠
        if (node.x > fromX && yOverlap) projDist = node.x - fromX
        else continue
        break
      case 'left':
        // 节点右边界严格在 fromX 左侧（半平面），且 y 方向区间重叠
        if (nodeRight < fromX && yOverlap) projDist = fromX - nodeRight
        else continue
        break
      case 'down':
        // 节点上边界严格在 fromY 下方（半平面），且 x 方向区间重叠
        if (node.y > fromY && xOverlap) projDist = node.y - fromY
        else continue
        break
      case 'up':
        // 节点下边界严格在 fromY 上方（半平面），且 x 方向区间重叠
        if (nodeBottom < fromY && xOverlap) projDist = fromY - nodeBottom
        else continue
        break
    }

    if (projDist < bestDist) {
      bestDist = projDist
      best = node
    }
  }

  return best
}