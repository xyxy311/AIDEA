import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useViewStore } from '@/stores/view'
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useThemeStore } from '@/stores/theme'
import { useCommands } from '@/composables/useCommands'
import { useModalStore } from '@/stores/modal'
import { globalIsDraggingNode } from '@/composables/useNodeDragging'
import { CONNECTION_STROKE_WIDTH, CONNECTION_TEMP_DASH, GRID_G } from '@/constants'
import {
  findNodeAtCell,
  nearestNodeInDirection,
  snapFocus,
  type GridDirection,
} from '@/utils/grid'

/**
 * 网格模式 - 键盘交互状态机（网格特有语义）
 *
 * 职责：在网格模式下注册 window keydown/keyup，实现"活动网格（焦点）"相关操作。
 * 只承载逻辑与状态，渲染（网格线、活动格高亮、临时连线）由 CanvasStage 后续消费
 * （通过本 composable 暴露的 computed/ref：gridTempConn / isGridConnecting）。
 *
 * 节点级动作已上移为 useKeyboardShortcuts 的锁定绑定，本 composable 不再承载：
 * - 方向键移动选中节点 → 快捷键层 arrowMove*（useActiveView.moveSelectedNodesByArrow）
 * - Enter 编辑选中节点 → 快捷键层 editSelected
 * - Esc 清空选中 → 快捷键层 escape（clearSelection）
 *
 * 本 composable 只承载网格特有语义：
 * - 活动网格光标移动（方向键 ±G）
 * - Ctrl+方向键最近节点导航（ctrlDirection）
 * - Shift 连线预览（startGridConnection / releaseGridConnection / cancelGridConnection）
 * - 焦点处建节点 / 命中仅选中（handleEnter，仅无选中时）
 *
 * 触发条件（守卫）：
 * - 仅主视图（view.type === 'main'）启用
 * - 当前视图开启网格模式（view.gridMode）
 * - 是当前活动视图（project.activeViewId === viewId）
 * - 焦点不在输入框 / 文本域（e.target instanceof HTMLInputElement/HTMLTextAreaElement）
 * - 未处于文本编辑（view.editingNodeId === null）
 *
 * 独占 / 放行事件顺序契约（与 useKeyboardShortcuts 协作）：
 * - Vue 子组件 onMounted 先于父组件触发：CanvasStage（子）的网格监听先于
 *   AppShell（父）挂载的快捷键监听执行。
 * - 本层调用 stopImmediatePropagation = 独占该键（快捷键层收不到）；
 *   不调用 = 放行给快捷键层（如非预览 Esc 清选中、有选中 Enter 进编辑、
 *   无修饰方向键的节点移动——本层只移动活动网格）。
 * - 不接管：Delete/Backspace、1-9、T+1-9、Ctrl+C/V 等（照常放行给快捷键层）。
 *
 * @param viewId - 视图 ID（仅主视图启用，调用方传 'main'）
 */
export function useGridMode(viewId: string) {
  const view = useViewStore(viewId)
  const nodeStore = useNodeStore()
  const project = useProjectStore()
  const commands = useCommands()
  const theme = useThemeStore()
  const modalStore = useModalStore()

  /** 方向键映射 */
  const arrowDirMap: Record<string, GridDirection> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  }

  // ── 连线预览状态 ──

  /** 连线预览的起点节点 ID（null 表示不在预览中） */
  const gridConnectingFrom = ref<string | null>(null)
  /** 起点节点是否为本次新建（用于 batch 合并 / 回滚） */
  let startNodeCreated = false
  /** 是否处于连线预览中 */
  const isGridConnecting = computed(() => gridConnectingFrom.value !== null)

  // ── 辅助函数 ──

  /** 当前视图直接子节点（网格几何判定 / 邻近搜索的候选集） */
  function directChildren() {
    return nodeStore.childrenOf(view.viewedNodeId)
  }

  /** 主锚点节点：selectedNodeId（第一个选中节点）或 null */
  function getMainAnchorNode() {
    const id = view.selectedNodeId
    if (!id) return null
    return nodeStore.getNode(id) ?? null
  }

  /** 方向 → (dx, dy) 步进（一格 G=100） */
  function dirDelta(dir: GridDirection): { dx: number; dy: number } {
    switch (dir) {
      case 'up':
        return { dx: 0, dy: -GRID_G }
      case 'down':
        return { dx: 0, dy: GRID_G }
      case 'left':
        return { dx: -GRID_G, dy: 0 }
      case 'right':
        return { dx: GRID_G, dy: 0 }
    }
  }

  // ── 状态机动作 ──

  /** 移动活动网格一格（±G=100） */
  function moveActiveGrid(dir: GridDirection): void {
    const g = view.activeGrid
    if (!g) return
    const { dx, dy } = dirDelta(dir)
    view.setActiveGrid(g.x + dx, g.y + dy)
  }

  /**
   * Ctrl+方向键：从"基准点"沿方向找最近节点并选中（活动网格不跟随节点，保持独立光标）。
   * 基准点：有选中时从主锚点节点中心出发（切换相邻节点直觉更顺）；
   *         无选中时从当前焦点出发。
   * 找不到节点 → 仅移动活动网格一格（与普通方向键一致）。
   */
  function ctrlDirection(dir: GridDirection): void {
    const children = directChildren()
    let fromX: number
    let fromY: number
    const anchor = getMainAnchorNode()
    if (anchor) {
      fromX = anchor.x + anchor.width / 2
      fromY = anchor.y + anchor.height / 2
    } else {
      const g = view.activeGrid
      if (!g) return
      fromX = g.x
      fromY = g.y
    }
    const target = nearestNodeInDirection(children, fromX, fromY, dir)
    if (target) {
      view.selectNode(target.id)
      view.setActiveGrid(snapFocus(target.x), snapFocus(target.y))
    } else {
      moveActiveGrid(dir)
      view.clearSelection()
    }
  }

  /**
   * Enter（仅无选中时被本层调用）：
   * 焦点落在某节点范围内（含边）→ 仅选中它（单选替换，不进入编辑，编辑交给用户二次 Enter）；
   * 否则 → 在焦点处新建节点（左上角吸附最近 100 格点，默认 200×100）并选中、进入编辑。
   * 有选中时的路由在 onKeydown 直接放行给快捷键层（editSelected 编辑选中节点）。
   */
  function handleEnter(): void {
    if (view.selectedNodeId) return
    const g = view.activeGrid
    if (!g) return
    const hitId = findNodeAtCell({ nodes: directChildren(), x: g.x, y: g.y })
    if (hitId) {
      view.selectNode(hitId)
    } else {
      // 新建：节点左上角 = 焦点坐标 - 50（焦点是单元格中心，减 50 即该单元格左上角）
      const newId = commands.createNode(
        view.viewedNodeId,
        g.x - 50,
        g.y - 50,
      )
      view.selectNode(newId)
      view.startEditing(newId)
    }
  }

  // ── 连线预览（Shift+方向键）──

  /**
   * Shift 按下（keydown，非 repeat）进入连线预览：确定起点节点。
   * 1. 有选中节点 → 以主锚点节点为起点
   * 2. 否则焦点落在某节点范围内 → 以该节点为起点
   * 3. 否则 → 在焦点处新建起点节点（batch 包裹，与鼠标"Shift+点空白建起点"同理）
   */
  function startGridConnection(): void {
    // 已有预览则忽略
    if (gridConnectingFrom.value !== null) return
    // activeGrid 未初始化时不新建（避免在 (0,0) 误建）
    if (!view.activeGrid) return

    const g = view.activeGrid
    const anchor = getMainAnchorNode()
    if (anchor) {
      gridConnectingFrom.value = anchor.id
      return
    }
    if (g) {
      const hitId = findNodeAtCell({ nodes: directChildren(), x: g.x, y: g.y })
      if (hitId) {
        gridConnectingFrom.value = hitId
        return
      }
    }
    // 无节点 → 在焦点处新建起点（左上角 = 焦点 - 50）
    commands.beginBatch()
    const newId = commands.createNode(
      view.viewedNodeId,
      g.x - 50,
      g.y - 50,
    )
    gridConnectingFrom.value = newId
    startNodeCreated = true
  }

  /**
   * Shift 释放（keyup）→ 提交连线：
   * - 焦点命中某节点且 ≠ 起点 → 直接连线
   * - 焦点处无节点 → 新建终点节点（左上角 = 焦点 - 50）再连线
   * - 焦点仍落在起点（未移动）→ 取消
   * 起点节点新建 + 终点节点新建 + 连线合并为单条历史（beginBatch/commitBatch/rollbackBatch）。
   */
  function releaseGridConnection(): void {
    const fromId = gridConnectingFrom.value
    if (!fromId) return
    const g = view.activeGrid 

    // 起点非新建时也开启 batch，保证本次操作（可能新建终点 + 连线）合并为单条历史
    if (!startNodeCreated) {
      commands.beginBatch()
    }

    let committed = false
    if (g) {
      const targetId = findNodeAtCell({ nodes: directChildren(), x: g.x, y: g.y })
      if (targetId && targetId !== fromId) {
        commands.addConnection(view.viewedNodeId, fromId, targetId)
        committed = true
      } else if (!targetId) {
        // 焦点处无节点 → 新建终点节点（左上角 = 焦点 - 50）并连线
        const endId = commands.createNode(view.viewedNodeId, g.x - 50, g.y - 50)
        if (endId !== fromId) {
          const connId = commands.addConnection(view.viewedNodeId, fromId, endId)
          if (connId) committed = true
        }
      }
      // targetId === fromId（未移动）→ 不提交
    }

    if (committed) {
      commands.commitBatch()
    } else {
      // 未提交（未移动/取消）：先清理本次新建起点节点的 store 副作用，再回滚 batch
      rollbackCreatedStartNode()
      commands.rollbackBatch()
      startNodeCreated = false
    }
    gridConnectingFrom.value = null
    startNodeCreated = false
  }

  /** Esc（预览中）：取消预览（起点为新建时 rollbackBatch 丢弃历史），清预览状态 */
  function cancelGridConnection(): void {
    if (gridConnectingFrom.value === null) return
    if (startNodeCreated) {
      rollbackCreatedStartNode()
      commands.rollbackBatch()
      startNodeCreated = false
    }
    gridConnectingFrom.value = null
  }

  /**
   * 清理本次新建起点节点的 store 副作用。
   *
   * startGridConnection 在焦点无节点时 beginBatch + createNode——batch 模式下 createNode
   * 直接改 store 且不入历史栈。取消/回滚时 rollbackBatch 只清 batchPatch，store 里起点节点
   * 仍存在且不入历史（用户无法 undo，dirty 标记也不一致）。故在回滚前先 deleteNodes 删除
   * 该新建起点，保持 store 与历史一致。这是回滚「未提交」操作，绕过命令层（不入 undo）可接受。
   */
  function rollbackCreatedStartNode(): void {
    if (!startNodeCreated) return
    const fromId = gridConnectingFrom.value
    if (fromId) nodeStore.deleteNodes([fromId])
  }

  // ── 临时连线渲染配置（供 CanvasStage 消费）──

  /**
   * 临时连线：从起点节点中心到当前焦点的 Konva Line 配置。
   * 未在预览/起点不存在时返回 { visible: false }（CanvasStage 据 visible 隐藏）。
   */
  const gridTempConn = computed(() => {
    const fromId = gridConnectingFrom.value
    const g = view.activeGrid
    if (!fromId || !g) return { visible: false }
    const fromNode = nodeStore.getNode(fromId)
    if (!fromNode) return { visible: false }
    return {
      visible: true,
      points: [
        fromNode.x + fromNode.width / 2,
        fromNode.y + fromNode.height / 2,
        g.x,
        g.y,
      ],
      stroke: theme.scheme.canvas.connectionTemp,
      strokeWidth: CONNECTION_STROKE_WIDTH,
      dash: CONNECTION_TEMP_DASH,
      listening: false,
      hitStrokeWidth: 0,
    }
  })

  // ── 守卫 ──

  /** 视图级守卫：主视图 + 网格开启 + 是当前活动视图 */
  function canAct(): boolean {
    // 模态打开 = 独占交互：网格键盘状态机整体停摆
    if (modalStore.hasOpenModal) return false
    if (view.type !== 'main') return false
    if (!view.gridMode) return false
    if (project.activeViewId !== viewId) return false
    return true
  }

  // ── 事件处理 ──

  function onKeydown(e: KeyboardEvent): void {
    // 输入框 / 文本域焦点、编辑态：不接管任何键
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (view.editingNodeId !== null) return
    if (!canAct()) return

    // Shift 按下（非 repeat）→ 进入连线预览（独占）
    if (e.key === 'Shift' && !e.repeat) {
      e.stopImmediatePropagation()
      startGridConnection()
      return
    }

    // Esc：预览中 → 独占取消预览（阻止快捷键层 clearSelection）；
    // 非预览 → 直接放行给快捷键层（escape 清选中）
    if (e.key === 'Escape') {
      if (gridConnectingFrom.value !== null) {
        e.preventDefault()
        e.stopImmediatePropagation()
        cancelGridConnection()
      }
      return
    }

    // 方向键
    const dir = arrowDirMap[e.key]
    if (dir) {
      // 拖拽节点中不响应方向键（避免与拖拽冲突）
      if (globalIsDraggingNode.value) return
      // 预览中 → 独占：只移动活动网格（锚点节点可能处于选中态，必须阻止快捷键层移动节点）
      if (gridConnectingFrom.value !== null) {
        e.preventDefault()
        e.stopImmediatePropagation()
        moveActiveGrid(dir)
        return
      }
      // Ctrl/Cmd+方向键 → 独占：最近节点导航
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        e.stopImmediatePropagation()
        ctrlDirection(dir)
        return
      }
      // 普通方向键 → 放行（不 stopImmediatePropagation）：本层只移动活动网格，
      // 节点移动由快捷键层 arrowMove*（moveSelectedNodesByArrow）承担
      e.preventDefault()
      moveActiveGrid(dir)
      return
    }

    // Enter：有选中 → 放行给快捷键层（editSelected 进入编辑）；
    // 无选中 → 独占处理（命中仅选中，防快捷键层接着进入编辑；
    // 未命中新建+编辑，防 startEditing 被快捷键层二次触发）
    if (e.key === 'Enter') {
      if (view.selectedNodeId) return
      e.preventDefault()
      e.stopImmediatePropagation()
      handleEnter()
    }
  }

  function onKeyup(e: KeyboardEvent): void {
    // Shift 释放 → 提交连线
    if (e.key === 'Shift' && gridConnectingFrom.value !== null) {
      releaseGridConnection()
    }
  }

  // ── 生命周期 ──

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('keyup', onKeyup)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('keyup', onKeyup)
    // 清理连线预览状态：若预览中卸载且起点为新建（已 beginBatch），先删除 store 里
    // 新建的起点节点，再回滚 batch，避免 store 残留孤儿节点（不入历史、无法 undo）。
    if (gridConnectingFrom.value !== null) {
      if (startNodeCreated) {
        rollbackCreatedStartNode()
        commands.rollbackBatch()
      }
      gridConnectingFrom.value = null
      startNodeCreated = false
    }
  })

  return {
    /** 连线预览起点节点 ID（null 表示不在预览中） */
    gridConnectingFrom,
    /** 是否处于连线预览中 */
    isGridConnecting,
    /** 临时连线 Konva Line 配置（CanvasStage 消费） */
    gridTempConn,
  }
}