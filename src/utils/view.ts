// 内联视图坐标映射工具：主世界/屏幕坐标与内联视图内部世界坐标互转，及节点包围盒与视口适配（公共逻辑）。
import type { WhiteboardNode } from '@/types'
import { MIN_SCALE, MAX_SCALE, INLINE_VIEW_TITLE_HEIGHT, INLINE_VIEW_MIN_HEIGHT, INLINE_VIEW_FIT_PADDING } from '@/constants'
import type { useNodeStore } from '@/stores/node'
import type { useViewStore } from '@/stores/view'

type NodeStore = ReturnType<typeof useNodeStore>
type ViewStore = ReturnType<typeof useViewStore>

/** 用主视图世界坐标 hit-test 各内联视图内容区（内容区 = 宿主节点矩形扣去标题栏高度）；返回命中的宿主节点 ID。 */
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

/** 主视图世界坐标 → 内联视图内部世界坐标（用于 reparent 落点）：内部像素 = 相对宿主内容区左上角偏移，再经 inline stage 变换。 */
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

/** 用屏幕坐标 hit-test 内联视图覆盖层内容区（经宿主 stage 变换与容器偏移）；返回命中的宿主节点 ID。 */
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

/** 屏幕坐标 → 主视图世界坐标（按主视图缩放与偏移逆变换）。 */
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

/** 屏幕坐标 → 内联视图内部世界坐标（先经宿主 stage 反算内部像素，再经内联 stage 变换）。 */
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

/** 计算节点列表的世界坐标包围盒；无节点时返回 null。 */
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

/** 计算使包围盒双向适应视口的缩放倍率（取宽高较小者，clamp 到 [minScale, maxScale]）；padding 为边距比例（如 0.12）。 */
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

/** 计算使包围盒在视口内居中的视口偏移（stageX / stageY）。 */
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
 * 内联视图自适应：以视口宽为基准求缩放（clamp），据节点高度重算内容区高度，
 * 再据实际内容区高度垂直居中；新总高度 = 内容区高度 + 标题栏，不小于 minHeight。
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
