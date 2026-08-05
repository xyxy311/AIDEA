import type { WhiteboardNode } from '@/types'
import { MIN_SCALE, MAX_SCALE, INLINE_VIEW_TITLE_HEIGHT, INLINE_VIEW_MIN_HEIGHT, INLINE_VIEW_FIT_PADDING } from '@/constants'
import type { useNodeStore } from '@/stores/node'
import type { useViewStore } from '@/stores/view'

type NodeStore = ReturnType<typeof useNodeStore>
type ViewStore = ReturnType<typeof useViewStore>

/**
 * 用主视图世界坐标 hit-test 所有内联视图的内容区矩形。
 * 内容区 = { x: node.x, y: node.y + TITLE_H, width: rect.width, height: rect.height - TITLE_H }
 *
 * @param worldX - 主视图世界坐标 X
 * @param worldY - 主视图世界坐标 Y
 * @param hostView - 宿主视图 store 实例
 * @param nodeStore - 节点 store 实例
 * @returns 命中的内联视图宿主节点 ID，未命中返回 null
 */
export function hitTestInlineViewWorld(
  worldX: number,
  worldY: number,
  hostView: ViewStore,
  nodeStore: NodeStore,
): string | null {
  const items = hostView.inlineViews
  for (const iv of items) {
    const node = nodeStore.getNode(iv.nodeId)
    const rect = hostView.getInlineViewRect(iv.nodeId)
    if (!node || !rect) continue

    const left = node.x
    const right = node.x + rect.width
    const top = node.y + INLINE_VIEW_TITLE_HEIGHT
    const bottom = node.y + rect.height

    if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
      return iv.nodeId
    }
  }
  return null
}

/**
 * 将主视图世界坐标映射为内联视图内部世界坐标（用于 reparent 后节点落点）。
 *
 * 内部像素 = 主世界相对宿主节点内容区左上角的偏移；
 * 内部世界 = (内部像素 - inlineStage) / inlineScale
 *
 * @param worldX - 主视图世界坐标 X
 * @param worldY - 主视图世界坐标 Y
 * @param inlineNodeId - 内联视图宿主节点 ID
 * @param inlineView - 内联视图 store 实例
 * @param hostView - 宿主视图 store 实例
 * @param nodeStore - 节点 store 实例
 * @returns 内联视图内部世界坐标
 */
export function mapMainWorldToInlineWorld(
  worldX: number,
  worldY: number,
  inlineNodeId: string,
  inlineView: ViewStore,
  hostView: ViewStore,
  nodeStore: NodeStore,
): { x: number; y: number } {
  const node = nodeStore.getNode(inlineNodeId)
  const rect = hostView.getInlineViewRect(inlineNodeId)
  if (!node || !rect) {
    return { x: worldX, y: worldY }
  }

  const pixelX = worldX - node.x
  const pixelY = worldY - node.y - INLINE_VIEW_TITLE_HEIGHT

  const scale = inlineView.stageScale !== 0 ? inlineView.stageScale : 1
  return {
    x: (pixelX - inlineView.stageX) / scale,
    y: (pixelY - inlineView.stageY) / scale,
  }
}

/**
 * 用屏幕坐标（clientX/clientY）hit-test 所有内联视图覆盖层的内容区。
 *
 * @param clientX - 屏幕 X 坐标
 * @param clientY - 屏幕 Y 坐标
 * @param hostView - 宿主视图 store 实例
 * @param hostContainerRect - 宿主视图 Stage 容器的 getBoundingClientRect()
 * @param nodeStore - 节点 store 实例
 * @returns 命中的内联视图宿主节点 ID，未命中返回 null
 */
export function hitTestInlineViewScreen(
  clientX: number,
  clientY: number,
  hostView: ViewStore,
  hostContainerRect: DOMRect,
  nodeStore: NodeStore,
): string | null {
  const s = hostView.stageScale !== 0 ? hostView.stageScale : 1
  const items = hostView.inlineViews

  for (const iv of items) {
    const node = nodeStore.getNode(iv.nodeId)
    const rect = hostView.getInlineViewRect(iv.nodeId)
    if (!node || !rect) continue

    const left = node.x * s + hostView.stageX + hostContainerRect.left
    const top = (node.y + INLINE_VIEW_TITLE_HEIGHT) * s + hostView.stageY + hostContainerRect.top
    const w = rect.width * s
    const h = (rect.height - INLINE_VIEW_TITLE_HEIGHT) * s

    if (clientX >= left && clientX <= left + w && clientY >= top && clientY <= top + h) {
      return iv.nodeId
    }
  }
  return null
}

/**
 * 屏幕坐标 -> 主视图世界坐标。
 *
 * @param clientX - 屏幕 X 坐标
 * @param clientY - 屏幕 Y 坐标
 * @param mainContainerRect - 主视图 Stage 容器的 getBoundingClientRect()
 * @param mainView - 主视图 store 实例
 * @returns 主视图世界坐标
 */
export function screenToMainWorld(
  clientX: number,
  clientY: number,
  mainContainerRect: DOMRect,
  mainView: ViewStore,
): { x: number; y: number } {
  const scale = mainView.stageScale !== 0 ? mainView.stageScale : 1
  return {
    x: (clientX - mainContainerRect.left - mainView.stageX) / scale,
    y: (clientY - mainContainerRect.top - mainView.stageY) / scale,
  }
}

/**
 * 屏幕坐标 -> 内联视图内部世界坐标。
 *
 * @param clientX - 屏幕 X 坐标
 * @param clientY - 屏幕 Y 坐标
 * @param inlineNodeId - 内联视图宿主节点 ID
 * @param inlineView - 内联视图 store 实例
 * @param hostView - 宿主视图 store 实例
 * @param hostContainerRect - 宿主视图 Stage 容器的 getBoundingClientRect()
 * @param nodeStore - 节点 store 实例
 * @returns 内联视图内部世界坐标
 */
export function screenToInlineWorld(
  clientX: number,
  clientY: number,
  inlineNodeId: string,
  inlineView: ViewStore,
  hostView: ViewStore,
  hostContainerRect: DOMRect,
  nodeStore: NodeStore,
): { x: number; y: number } {
  const node = nodeStore.getNode(inlineNodeId)
  const rect = hostView.getInlineViewRect(inlineNodeId)
  if (!node || !rect) {
    return { x: clientX, y: clientY }
  }

  const hostScale = hostView.stageScale !== 0 ? hostView.stageScale : 1
  const left = node.x * hostScale + hostView.stageX + hostContainerRect.left
  const top = (node.y + INLINE_VIEW_TITLE_HEIGHT) * hostScale + hostView.stageY + hostContainerRect.top

  const pixelX = (clientX - left) / hostScale
  const pixelY = (clientY - top) / hostScale

  const inlineScale = inlineView.stageScale !== 0 ? inlineView.stageScale : 1
  return {
    x: (pixelX - inlineView.stageX) / inlineScale,
    y: (pixelY - inlineView.stageY) / inlineScale,
  }
}

// ── 节点包围盒与视口适配（公共逻辑，从 OverviewMap 提取）──

/** 矩形（世界坐标包围盒或视口） */
export interface BoundsRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 计算节点的世界坐标包围盒。
 * @param nodes 节点列表
 * @returns 包围盒；无节点时返回 null
 */
export function getNodesBounds(nodes: WhiteboardNode[]): BoundsRect | null {
  if (nodes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    if (node.x < minX) minX = node.x
    if (node.y < minY) minY = node.y
    if (node.x + node.width > maxX) maxX = node.x + node.width
    if (node.y + node.height > maxY) maxY = node.y + node.height
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * 计算使包围盒双向适应视口的缩放倍率（取宽高方向较小者，clamp 到 [minScale, maxScale]）。
 * padding 为比例值（如 0.12 表示四周各留 12%）。
 */
export function computeFitScale(
  boundsWidth: number,
  boundsHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding: number,
  minScale: number,
  maxScale: number,
): number {
  const paddedW = boundsWidth * (1 + padding)
  const paddedH = boundsHeight * (1 + padding)
  if (paddedW <= 0 || paddedH <= 0) return minScale
  const scaleX = viewportWidth / paddedW
  const scaleY = viewportHeight / paddedH
  return Math.max(minScale, Math.min(maxScale, Math.min(scaleX, scaleY)))
}

/**
 * 计算使包围盒在视口中居中的视口偏移（stageX / stageY）。
 */
export function computeCenteredViewport(
  bounds: BoundsRect,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  return {
    x: viewportWidth / 2 - centerX * scale,
    y: viewportHeight / 2 - centerY * scale,
  }
}

/**
 * 内联视图自适应：以视口宽度为基准计算缩放倍率，并据节点高度自适应新视口高度。
 *
 * 算法：
 * - 缩放 scale = viewportWidth / (boundsWidth * (1 + padding))，clamp 到 [minScale, maxScale]
 *   （超出范围则整体放大/缩小到边界）
 * - 新内容区高度 = boundsHeight * scale * (1 + padding)
 * - 新总高度 newHeight = 内容区高度 + titleHeight（不小于 minHeight）
 * - 视口居中（基于实际内容区高度）
 *
 * @param nodes 内联视图宿主节点的子节点列表
 * @param viewportWidth 内联视图当前宽度（inlineRect.width，保持不变）
 * @param padding 边距比例
 * @param minScale 最小缩放倍率
 * @param maxScale 最大缩放倍率
 * @param titleHeight 内联视图标题栏高度
 * @param minHeight 内联视图最小总高度
 * @returns 自适应结果（scale / newHeight / stageX / stageY）；无节点或宽度无效时返回 null
 */
export function computeInlineFit(
  nodes: WhiteboardNode[],
  viewportWidth: number,
  padding: number,
  minScale: number,
  maxScale: number,
  titleHeight: number,
  minHeight: number,
): { scale: number; newHeight: number; stageX: number; stageY: number } | null {
  const bounds = getNodesBounds(nodes)
  if (!bounds) return null

  const paddedW = bounds.width * (1 + padding)
  if (paddedW <= 0 || viewportWidth <= 0) return null
  const scale = Math.max(minScale, Math.min(maxScale, viewportWidth / paddedW))

  const paddedH = bounds.height * (1 + padding)
  const contentHeight = paddedH * scale
  const newHeight = Math.max(minHeight, contentHeight + titleHeight)

  // 实际内容区高度（用于垂直居中）
  const canvasHeight = newHeight - titleHeight
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const stageX = viewportWidth / 2 - centerX * scale
  const stageY = canvasHeight / 2 - centerY * scale

  return { scale, newHeight, stageX, stageY }
}
