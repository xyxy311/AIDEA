import { ref } from 'vue'
import type { Ref } from 'vue'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import { useViewStore } from '@/stores/view'
import { useNodeStore } from '@/stores/node'
import { useModalStore } from '@/stores/modal'
import { useCommands } from '@/composables/useCommands'
import { NODE_DRAG_THRESHOLD } from '@/constants'
import { snapPosition } from '@/utils/grid'
import {
  hitTestInlineViewWorld,
  mapMainWorldToInlineWorld,
  hitTestInlineViewScreen,
  screenToMainWorld,
  screenToInlineWorld,
} from '@/utils/view'
import { findConnectionInsertTarget } from '@/utils/connectionInsert'
import { CONNECTION_INSERT_HIT_PADDING } from '@/constants'

/**
 * 全局共享：当前是否正在拖拽节点（跨视图实例同步）。
 * 每个 useNodeDragging 实例持有局部 isDragging，此处为模块级共享信号，
 * 供浮动属性编辑器等全局 UI 感知拖拽状态（拖拽期间隐藏自身）。
 * 同一时刻仅一个视图实例在拖拽，故单一布尔即可。
 */
export const globalIsDraggingNode = ref(false)

/**
 * 节点拖动交互：纯鼠标事件驱动（替代 Konva 原生 draggable），支持跨视图拖拽
 * （主视图<->内联视图 reparent）。拖拽全程由 window mousemove 驱动，鼠标移入内联
 * 覆盖层后 stage 收不到事件，用屏幕坐标经 utils/view 换算世界坐标并跟随。
 */
export function useNodeDragging(viewId: string) {
  const view = useViewStore(viewId)
  const mainView = useViewStore('main')
  const nodeStore = useNodeStore()
  const commands = useCommands()
  const modalStore = useModalStore()

  /** 是否正在拖动节点（已超过阈值激活） */
  const isDragging: Ref<boolean> = ref(false)

  /**
   * 拖动无连线节点悬于某条连线上时的插入目标连线 id（null = 无目标）。
   * 供 WhiteboardConnection 高亮提示，拖动释放时把节点插入连线（A->B 变 A->C->B）。
   */
  const insertTargetConnId: Ref<string | null> = ref(null)

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

  /**
   * 从屏幕坐标（clientX/clientY）计算当前视图世界坐标。
   * 用于 window mousemove 兜底：鼠标进入内联视图 DOM 覆盖层后 stage 收不到事件，
   * 需用屏幕坐标手动换算。与 stage.getRelativePointerPosition() 等价。
   * - 主视图：screenToMainWorld
   * - 内联视图：screenToInlineWorld（viewedNodeId 即宿主节点 id）
   */
  function screenToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    const mainRect = mainView.containerEl?.getBoundingClientRect()
    if (!mainRect) return null
    if (view.type === 'main') {
      return screenToMainWorld(clientX, clientY, mainRect, view)
    }
    return screenToInlineWorld(
      clientX,
      clientY,
      view.viewedNodeId,
      view,
      mainView,
      mainRect,
      nodeStore,
    )
  }

  /**
   * 提交同视图内移动到历史栈（拖拽未跨视图时）。
   *
   * 网格模式下（仅主视图）：先把每个节点最终位置吸附到网格（snapPosition），
   * 并同步写入 store（moveNode），使显示与历史 patch 一致，保证拖拽结束后节点对齐。
   * 跨视图 reparent 的 performReparent 不动——grid 仅主视图，reparent 到内联视图的
   * 内联世界坐标不吸附（保持简单）。
   */
  /**
   * 收集待提交的节点移动（网格模式下先吸附并同步 store，使显示与历史一致）。
   * 返回空数组表示无位移。
   */
  function collectMovePositions(): Array<{
    id: string
    oldX: number
    oldY: number
    newX: number
    newY: number
  }> {
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
        let newX = n.x
        let newY = n.y
        // 网格模式：吸附到最近 100 格点，并同步 store 使显示与历史一致
        if (view.gridMode) {
          newX = snapPosition(n.x)
          newY = snapPosition(n.y)
          nodeStore.moveNode(id, newX, newY)
        }
        positions.push({ id, oldX: start.x, oldY: start.y, newX, newY })
      }
    })
    return positions
  }

  function commitMovePositions(): void {
    const positions = collectMovePositions()
    if (positions.length > 0) commands.commitNodeMove(positions)
  }

  /**
   * 更新插入目标连线：仅单节点拖拽且节点无任何连线时判定；
   * 命中条件见 utils/connectionInsert（线段与节点外扩矩形相交）。
   */
  function updateInsertTarget(): void {
    insertTargetConnId.value = null
    const id = pendingNodeId
    if (dragStartPositions.size !== 1 || !id) return
    const node = nodeStore.getNode(id)
    if (!node) return
    const conns = nodeStore.getConnections(view.viewedNodeId)
    // 无连线节点：本视图连线中无涉及该节点的连线
    if (conns.some((c) => c.fromNodeId === id || c.toNodeId === id)) return
    insertTargetConnId.value = findConnectionInsertTarget(
      conns,
      (nid) => nodeStore.getNode(nid) ?? undefined,
      { x: node.x, y: node.y, width: node.width, height: node.height },
      id,
      CONNECTION_INSERT_HIT_PADDING,
    )
  }

  /**
   * 提交"节点插入连线"：节点移动 + 原连线改端 + 新增 C->B 合并为单条历史。
   */
  function commitInsertIntoConnection(): void {
    const connId = insertTargetConnId.value
    const id = pendingNodeId
    if (!connId || !id) {
      commitMovePositions()
      return
    }
    const positions = collectMovePositions()
    commands.insertNodeIntoConnection(view.viewedNodeId, connId, id, positions)
  }

  /** 清理拖拽状态（含视图状态恢复） */
  function cleanupDragState(): void {
    isDragging.value = false
    globalIsDraggingNode.value = false
    insertTargetConnId.value = null
    pendingNodeId = null
    pendingStart = null
    dragStartPositions.clear()
    window.removeEventListener('mousemove', onWindowMouseMove)
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
    } else if (insertTargetConnId.value) {
      commitInsertIntoConnection()
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
    // 拖拽全程由 window mousemove 驱动（避免鼠标进入内联覆盖层后 stage 收不到事件而暂停）
    window.addEventListener('mousemove', onWindowMouseMove)
    window.addEventListener('mouseup', onWindowMouseUp, { once: true })
    return true
  }

  /**
   * 拖拽移动核心逻辑（阈值激活 + 同步移动选中节点）。由 window mousemove 驱动。
   * @param pos 当前视图世界坐标
   */
  function processDragMove(pos: { x: number; y: number }): void {
    if (!pendingNodeId || !pendingStart) return

    // 首次移动超过阈值才激活拖动
    if (!isDragging.value) {
      const dx = Math.abs(pos.x - pendingStart.x)
      const dy = Math.abs(pos.y - pendingStart.y)
      if (dx < NODE_DRAG_THRESHOLD && dy < NODE_DRAG_THRESHOLD) return

      // 激活拖动
      isDragging.value = true
      globalIsDraggingNode.value = true

      // 若被拖节点未选中，单选它（拖动一个未选中节点意味着"我要移动这个节点"）
      if (!view.selectedNodeIds.has(pendingNodeId)) {
        view.selectNode(pendingNodeId, false)
      }
      // 记录当前视图渲染的选中节点初始位置（选中状态可能刚变，需在激活后快照）
      // 只纳入当前视图直接子节点；跨视图选中时避免移动其他视图节点导致坐标错乱
      dragStartPositions.clear()
      view.selectedNodeIds.forEach((id) => {
        const n = nodeStore.getNode(id)
        if (n && n.parentId === view.viewedNodeId) {
          dragStartPositions.set(id, { x: n.x, y: n.y })
        }
      })
    }

    // 按总 delta 同步移动所有选中节点（起点固定不动，保证多选相对位置不变）
    const deltaX = pos.x - pendingStart.x
    const deltaY = pos.y - pendingStart.y
    dragStartPositions.forEach((start, id) => {
      nodeStore.moveNode(id, start.x + deltaX, start.y + deltaY)
    })

    // 移动后更新"节点插入连线"目标（供连线高亮，释放时插入）
    updateInsertTarget()
  }

  /**
   * stage mousemove：拖拽全程改由 window mousemove（onWindowMouseMove）驱动。
   * 鼠标进入内联视图 DOM 覆盖层后主 stage 收不到 mousemove，若仍由 stage 驱动会导致拖拽暂停；
   * 故此处不再处理移动，保留仅为维持 WhiteboardCanvas 的事件绑定签名。
   */
  function handleMouseMove(_e: KonvaEventObject<MouseEvent>): void {
    void _e
  }

  /**
   * window mousemove 兜底：拖拽期间鼠标移入内联视图 DOM 覆盖层后，主 stage 收不到 mousemove，
   * 由此用屏幕坐标计算世界坐标并驱动节点跟随，避免拖拽暂停。
   * mousedown 接管后注册，cleanupDragState 时移除。
   */
  function onWindowMouseMove(e: MouseEvent): void {
    // 模态打开 = 独占交互：冻结移动——不激活新拖拽，进行中的移动也不再跟随。
    // 与 onWindowMouseUp 不对称（mouseup 兜底刻意不做模态检查）：
    // mouseup 必须保证「模态打开前已开始的拖拽」在松手时经 finishDrag 自然 commit
    // 收尾，否则拖拽状态（pendingNodeId / window 监听）悬挂、提交丢失。
    if (modalStore.hasOpenModal) return
    if (!pendingNodeId || !pendingStart) return
    const pos = screenToWorld(e.clientX, e.clientY)
    if (!pos) return
    processDragMove(pos)
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
    // 刻意不做 hasOpenModal 检查：拖拽进行中打开模态时（罕见，如程序化 open），
    // 松手仍需经 finishDrag / cleanupDragState 自然收尾提交（commit 入历史栈），
    // 避免拖拽状态悬挂与 window mousemove 监听泄漏；移动冻结由
    // onWindowMouseMove 的模态守卫保证。与 mousemove 守卫不对称的原因见其注释。
    if (!pendingNodeId) return
    if (isDragging.value) {
      finishDrag(e.clientX, e.clientY)
    } else {
      // 纯 click 但 stage mouseup 未触发（鼠标移出 Stage）：不处理选中，仅清理
      cleanupDragState()
    }
  }

  return { isDragging, insertTargetConnId, handleMouseDown, handleMouseMove, handleMouseUp }
}
