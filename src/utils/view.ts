import type { WhiteboardNode } from '@/types'
import { INLINE_VIEW_TITLE_HEIGHT } from '@/constants'
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
