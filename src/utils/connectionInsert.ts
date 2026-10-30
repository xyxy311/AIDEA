/**
 * 连线插入命中检测：拖动无连线节点悬于 A->B 连线上时，判定该连线是否可被"节点插入"（A->C->B）。
 * 纯函数，供 useNodeDragging 拖拽移动时调用与单元测试。
 */
import type { Connection } from '@/types'

/** 命中判定的矩形（世界坐标） */
export interface InsertHitRect {
  x: number
  y: number
  width: number
  height: number
}

/** 线段与外扩矩形是否相交（Liang-Barsky 参数裁剪；零长度线段按点包含判定） */
export function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: InsertHitRect,
  padding: number,
): boolean {
  const minX = rect.x - padding
  const minY = rect.y - padding
  const maxX = rect.x + rect.width + padding
  const maxY = rect.y + rect.height + padding

  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) {
    return x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY
  }

  // 参数化 t∈[0,1]：四条边界条件 q[i] + p[i]*t >= 0
  let t0 = 0
  let t1 = 1
  const p = [-dx, dx, -dy, dy]
  const q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      // 线段平行于该边界且在界外
      if (q[i] < 0) return false
    } else {
      const t = q[i] / p[i]
      if (p[i] < 0) {
        if (t > t1) return false
        if (t > t0) t0 = t
      } else {
        if (t < t0) return false
        if (t < t1) t1 = t
      }
    }
  }
  return t0 <= t1
}

/**
 * 在连线列表中查找可被节点"插入"的目标连线（返回连线 id，无则 null）：
 * - 连线两端节点中心的线段与节点外扩矩形相交；
 * - 跳过涉及被拖节点的连线（防御）；
 * - 节点覆盖端点节点中心时不命中（拖到 A/B 自身上方视为普通移动）。
 */
export function findConnectionInsertTarget(
  connections: Connection[],
  getNode: (id: string) => InsertHitRect | undefined,
  rect: InsertHitRect,
  excludeNodeId: string,
  padding: number,
): string | null {
  const centerCache = new Map<string, { x: number; y: number } | null>()
  const centerOf = (id: string): { x: number; y: number } | null => {
    if (!centerCache.has(id)) {
      const n = getNode(id)
      centerCache.set(
        id,
        n ? { x: n.x + n.width / 2, y: n.y + n.height / 2 } : null,
      )
    }
    return centerCache.get(id) ?? null
  }

  for (const conn of connections) {
    if (conn.fromNodeId === excludeNodeId || conn.toNodeId === excludeNodeId) continue
    const from = centerOf(conn.fromNodeId)
    const to = centerOf(conn.toNodeId)
    if (!from || !to) continue
    // 拖到端点节点自身上方：不做插入
    const overEndpoint =
      (rect.x <= from.x && from.x <= rect.x + rect.width && rect.y <= from.y && from.y <= rect.y + rect.height) ||
      (rect.x <= to.x && to.x <= rect.x + rect.width && rect.y <= to.y && to.y <= rect.y + rect.height)
    if (overEndpoint) continue
    if (segmentIntersectsRect(from.x, from.y, to.x, to.y, rect, padding)) return conn.id
  }
  return null
}
