import { ref } from 'vue'
import type { Ref } from 'vue'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import { useViewStore } from '@/stores/view'
import { useNodeStore } from '@/stores/node'
import { useCommands } from '@/composables/useCommands'
import { NODE_DRAG_THRESHOLD } from '@/constants'
import {
  hitTestInlineViewWorld,
  mapMainWorldToInlineWorld,
  hitTestInlineViewScreen,
  screenToMainWorld,
} from '@/utils/view'

/**
 * 节点拖动交互 Composable
 *
 * 以纯鼠标事件驱动节点拖拽（替代 Konva 原生 draggable），统一在
 * WhiteboardCanvas 的 Stage 事件中处理，与框选、连线创建等交互模式一致。
 *
 * 支持跨视图拖拽：主视图拖节点到内联视图（reparent 到内联视图观察的节点），
 * 内联视图拖节点回主视图（reparent 到主视图 viewedNodeId）。
 *
 * @param viewId - 视图 ID（主视图传 'main'）
 *
 * 交互流程：
 *   1. handleMouseDown：检测是否点中节点，记录起点（不改变选中状态）
 *   2. handleMouseMove：移动超过阈值才激活拖动；激活时若被拖节点未选中则单选它，
 *      然后按总 delta 同步移动所有选中节点；主视图拖拽中实时更新悬停的内联视图
 *   3. handleMouseUp：若未拖动（纯 click）则处理选中；若已拖动则判断跨视图 reparent
 *      或同视图提交移动
 *
 * 事件分流由 WhiteboardCanvas 负责：Shift 走连线创建，PanMode 走平移，
 * 命中节点走本 composable，空白走框选。
 *
 * 坐标系：stage.getRelativePointerPosition() 返回世界坐标，与 node.x/y 同系。
 * 跨视图判断用屏幕坐标（clientX/clientY）经 utils/view 映射，不依赖 stage 事件。
 */
export function useNodeDragging(viewId: string) {
  const view = useViewStore(viewId)
  const mainView = useViewStore('main')
  const nodeStore = useNodeStore()
  const commands = useCommands()

  /** 是否正在拖动节点（已超过阈值激活） */
  const isDragging: Ref<boolean> = ref(false)

  /** mousedown 命中的节点 ID（拖动候选，未激活前不改变选中状态） */
  let pendingNodeId: string | null = null

  /** mousedown 时的世界坐标起点（用于阈值判断和 delta 计算） */
  let pendingStart: { x: number; y: number } | null = null

  /** 所有选中节点在拖动激活时的初始位置快照（用于多选同步移动） */
  let dragStartPositions: Map<string, { x: number; y: number }> = new Map()

  // ── 辅助函数 ──

  /**
   * 从事件目标向上查找所属节点的 ID
   * 遍历父节点链，找到 name 属性匹配节点 ID 的 Group
   */
  function findNodeIdFromTarget(target: Konva.Node): string | null {
    let current: Konva.Node | null = target
    while (current && current.nodeType !== 'Stage') {
      const nodeName: string = current.name()
      if (nodeName && nodeStore.nodes.has(nodeName)) {
        return nodeName
      }
      current = current.getParent()
    }
    return null
  }

  /** 从事件获取世界坐标 */
  function getWorldPos(e: KonvaEventObject<MouseEvent>): { x: number; y: number } | null {
    const stage = e.target.getStage()
    if (!stage) return null
    return stage.getRelativePointerPosition()
  }

  /** 提交同视图内移动到历史栈（拖拽未跨视图时） */
  function commitMovePositions(): void {
    const positions: Array<{
      id: string
      oldX: number
      oldY: number
      newX: number
      newY: number
    }> = []
    dragStartPositions.forEach((start, id) => {
      const n = nodeStore.getNode(id)
      if (n && (n.x !== start.x || n.y !== start.y)) {
        positions.push({ id, oldX: start.x, oldY: start.y, newX: n.x, newY: n.y })
      }
    })
    if (positions.length > 0) commands.commitNodeMove(positions)
  }

  /** 清理拖拽状态（含视图状态恢复） */
  function cleanupDragState(): void {
    isDragging.value = false
    pendingNodeId = null
    pendingStart = null
    dragStartPositions.clear()
  }

  /**
   * 解析拖拽落点目标视图。
   * - 主视图拖拽：用主世界坐标 hit-test 内联视图内容区，命中则 reparent 到该内联视图观察的节点(iv.nodeId)。
   * - 内联视图拖拽：用屏幕坐标 hit-test 主视图内联覆盖层，未命中(落在主视图空白)则 reparent 到主视图 viewedNodeId。
   * @returns 目标父级信息，null 表示同视图移动
   */
  function resolveDropTarget(
    clientX: number,
    clientY: number,
    mainRect: DOMRect,
  ): { targetParentId: string; targetInlineViewId: string | null } | null {
    if (view.type === 'main') {
      // 主->内联：用主世界坐标 hit-test 内联矩形
      const world = screenToMainWorld(clientX, clientY, mainRect, view)
      const overId = hitTestInlineViewWorld(world.x, world.y, view, nodeStore)
      if (overId) {
        const iv = view.inlineViews.find((v) => v.nodeId === overId)
        if (iv) {
          // targetParentId = 内联视图观察的节点 = 宿主节点 id
          return { targetParentId: iv.nodeId, targetInlineViewId: iv.viewId }
        }
      }
      return null
    } else {
      // 内联->主：屏幕坐标 hit-test 主视图内联覆盖层
      const overId = hitTestInlineViewScreen(clientX, clientY, mainView, mainRect, nodeStore)
      if (overId === null) {
        // 落在主视图区域(非任何内联覆盖层) -> reparent 到主视图 viewedNodeId
        return { targetParentId: mainView.viewedNodeId, targetInlineViewId: null }
      }
      return null // 落在内联覆盖层(含自身) -> 同视图移动
    }
  }

  /**
   * 执行跨视图 reparent。
   * 主拖节点对齐鼠标在目标视图的映射位置，其余节点按缩放比转换相对偏移以保持几何。
   *  主->内联：内联世界偏移 = 主世界偏移 / inlineScale
   *  内联->主：主世界偏移 = 内联世界偏移 * inlineScale
   */
  function performReparent(
    target: { targetParentId: string; targetInlineViewId: string | null },
    clientX: number,
    clientY: number,
    mainRect: DOMRect,
  ): void {
    const ids = Array.from(dragStartPositions.keys())
    // 防环 + 过滤（reparentTo 内部也会做，这里先过滤以便位置计算）
    const validIds = ids.filter((id) => {
      if (id === target.targetParentId) return false
      return !nodeStore.descendantsOf(id).includes(target.targetParentId)
    })
    if (validIds.length === 0) {
      commitMovePositions()
      return
    }

    const mainWorld = screenToMainWorld(clientX, clientY, mainRect, mainView)
    let baseX: number
    let baseY: number
    let isMainTarget: boolean
    let scaleForOffset: number

    if (target.targetInlineViewId) {
      // 目标是内联视图：主世界 -> 内联世界
      const inlineView = useViewStore(target.targetInlineViewId)
      const mapped = mapMainWorldToInlineWorld(
        mainWorld.x,
        mainWorld.y,
        target.targetParentId,
        inlineView,
        mainView,
        nodeStore,
      )
      baseX = mapped.x
      baseY = mapped.y
      isMainTarget = false
      scaleForOffset = inlineView.stageScale !== 0 ? inlineView.stageScale : 1
    } else {
      // 目标是主视图
      baseX = mainWorld.x
      baseY = mainWorld.y
      isMainTarget = true
      scaleForOffset = view.stageScale !== 0 ? view.stageScale : 1
    }

    const pendingNode = pendingNodeId ? nodeStore.getNode(pendingNodeId) : null
    const pendingX = pendingNode?.x ?? 0
    const pendingY = pendingNode?.y ?? 0

    const newPositions = new Map<string, { x: number; y: number }>()
    for (const id of validIds) {
      const node = nodeStore.getNode(id)
      if (!node) continue
      const dx = node.x - pendingX
      const dy = node.y - pendingY
      let targetDx: number
      let targetDy: number
      if (isMainTarget) {
        // 内联 -> 主：主世界偏移 = 内联世界偏移 * inlineScale
        targetDx = (dx - node.width / 2) * scaleForOffset
        targetDy = (dy - node.height / 2) * scaleForOffset
      } else {
        // 主 -> 内联：内联世界偏移 = 主世界偏移 / inlineScale
        targetDx = (dx - node.width / 2) / scaleForOffset
        targetDy = (dy - node.height / 2) / scaleForOffset
      }
      newPositions.set(id, { x: baseX + targetDx, y: baseY + targetDy })
    }

    commands.reparentTo(validIds, target.targetParentId, newPositions)
    // reparent 后节点离开当前视图，清空选中
    view.clearSelection()
  }

  /** 拖拽结束统一处理：判断跨视图 reparent 或同视图移动 */
  function finishDrag(clientX: number, clientY: number): void {
    if (!isDragging.value) return // 纯 click 不在此处理

    const mainRect = mainView.containerEl?.getBoundingClientRect()
    if (!mainRect) {
      // 无 DOM 引用，退化为同视图移动
      commitMovePositions()
      cleanupDragState()
      return
    }

    const target = resolveDropTarget(clientX, clientY, mainRect)
    if (target) {
      performReparent(target, clientX, clientY, mainRect)
    } else {
      commitMovePositions()
    }
    cleanupDragState()
  }

  // ── 鼠标事件处理 ──

  /**
   * mousedown：检测是否点中节点，记录拖动候选。
   * @returns true 表示命中节点（已接管），false 表示非节点（交由框选处理）
   */
  function handleMouseDown(e: KonvaEventObject<MouseEvent>): boolean {
    // 仅响应左键；右键留给 contextmenu，避免右键点节点被当成 click 触发 selectNode 清空多选
    if (e.evt.button !== 0) return false
    // 空白区域（Stage 自身），交由框选
    if (e.target === e.currentTarget) return false

    const nodeId = findNodeIdFromTarget(e.target)
    if (!nodeId) return false // 非节点（如连线），不接管

    pendingNodeId = nodeId
    const pos = getWorldPos(e)
    if (!pos) {
      pendingNodeId = null
      return false
    }
    pendingStart = { x: pos.x, y: pos.y }
    window.addEventListener('mouseup', onWindowMouseUp, { once: true })
    return true
  }

  /** mousemove：超过阈值激活拖动，同步移动所有选中节点 */
  function handleMouseMove(e: KonvaEventObject<MouseEvent>): void {
    if (!pendingNodeId || !pendingStart) return

    const pos = getWorldPos(e)
    if (!pos) return

    // 首次移动超过阈值才激活拖动
    if (!isDragging.value) {
      const dx = Math.abs(pos.x - pendingStart.x)
      const dy = Math.abs(pos.y - pendingStart.y)
      if (dx < NODE_DRAG_THRESHOLD && dy < NODE_DRAG_THRESHOLD) return

      // 激活拖动
      isDragging.value = true

      // 若被拖节点未选中，单选它（拖动一个未选中节点意味着"我要移动这个节点"）
      if (!view.selectedNodeIds.has(pendingNodeId)) {
        view.selectNode(pendingNodeId, false)
      }
      // 记录所有选中节点初始位置（选中状态可能刚变，需在激活后快照）
      dragStartPositions.clear()
      view.selectedNodeIds.forEach((id) => {
        const n = nodeStore.getNode(id)
        if (n) dragStartPositions.set(id, { x: n.x, y: n.y })
      })
    }

    // 按总 delta 同步移动所有选中节点（起点固定不动，保证多选相对位置不变）
    const deltaX = pos.x - pendingStart.x
    const deltaY = pos.y - pendingStart.y
    dragStartPositions.forEach((start, id) => {
      nodeStore.moveNode(id, start.x + deltaX, start.y + deltaY)
    })
  }

  /** mouseup：纯 click 处理选中；拖动结束判断跨视图 reparent */
  function handleMouseUp(e: KonvaEventObject<MouseEvent>): void {
    if (!pendingNodeId) return // 非节点拖动，不处理

    if (!isDragging.value) {
      // 纯 click（未超过阈值）：处理选中（单选 / Ctrl toggle）
      const ctrl = e.evt.ctrlKey || e.evt.metaKey
      view.selectNode(pendingNodeId, ctrl)
      cleanupDragState()
    } else {
      // 拖拽结束：跨视图判断
      finishDrag(e.evt.clientX, e.evt.clientY)
    }
  }

  /**
   * window mouseup 兜底：鼠标移出 Stage（如从内联视图覆盖层拖出到主视图区域）松手时，
   * stage 的 mouseup 不触发，由此兜底处理跨视图 reparent 或提交移动。
   * 若 stage mouseup 已处理（状态已清），此处 pendingNodeId 为 null 直接返回，幂等无副作用。
   */
  function onWindowMouseUp(e: MouseEvent): void {
    if (!pendingNodeId) return
    if (isDragging.value) {
      finishDrag(e.clientX, e.clientY)
    } else {
      // 纯 click 但 stage mouseup 未触发（鼠标移出 Stage）：不处理选中，仅清理
      cleanupDragState()
    }
  }

  return { isDragging, handleMouseDown, handleMouseMove, handleMouseUp }
}
