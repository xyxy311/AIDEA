<script setup lang="ts">
/**
 * CanvasStage - 通用画布组件。渲染 Konva Stage 与节点/连线，连接各 composables 到 Store，
 * 管理文本编辑器生命周期。经 props.viewId 绑定任一视图（主/内联），内部无特判。
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useViewStore } from '@/stores/view'
import { useNodeStore } from '@/stores/node'
import { useThemeStore } from '@/stores/theme'
import { useProjectStore } from '@/stores/project'
import { useCommands } from '@/composables/useCommands'
import {
  useStageSize,
  registerStageContainer,
  unregisterStageContainer,
} from '@/composables/useStageSize'
import { useCanvasEvents } from '@/composables/useCanvasEvents'
import { useCanvasNavigation } from '@/composables/useCanvasNavigation'
import { useConnectionCreation } from '@/composables/useConnectionCreation'
import { useMarqueeSelection } from '@/composables/useMarqueeSelection'
import { useNodeDragging } from '@/composables/useNodeDragging'
import { useGridMode } from '@/composables/useGridMode'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { VueKonvaRef } from 'vue-konva'
import type Konva from 'konva'
import {
  MIN_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  TRANSFORMER_ANCHOR_SIZE,
  TRANSFORMER_BORDER_DASH,
  INLINE_VIEW_MIN_WIDTH,
  INLINE_VIEW_MIN_HEIGHT,
  GRID_G,
} from '@/constants'
import { snapFocus, snapPosition, snapSize } from '@/utils/grid'
import WhiteboardNode from './WhiteboardNode.vue'
import WhiteboardConnection from './WhiteboardConnection.vue'
import InlineViewFrame from './InlineViewFrame.vue'
import InlineViewCanvas from './InlineViewCanvas.vue'
import NodeTextEditor from './NodeTextEditor.vue'
import ConnectionTextEditor from './ConnectionTextEditor.vue'
import OverviewMap from './OverviewMap.vue'
import ContextMenu from './ContextMenu.vue'
import type { ContextMenuItem } from '@/composables/useContextMenu'

// ── Props ──
const props = defineProps<{
  /** 视图 ID（'main' 主视图，其他内联视图） */
  viewId: string
  /** 是否允许"展开/收起"右键菜单（仅主视图） */
  allowExpand?: boolean
  /** 是否显示右下角小地图（仅主视图） */
  showOverviewMap?: boolean
  /** 画布宽/高（内联视图用容器尺寸；不传则用窗口尺寸） */
  width?: number
  height?: number
}>()

// ── Store ──
const view = useViewStore(props.viewId)
const nodeStore = useNodeStore()
const theme = useThemeStore()
const commands = useCommands()
const project = useProjectStore()

// ── Stage 尺寸 ──
// 主视图用窗口尺寸；内联视图用容器尺寸（通过 props 传入）
const externalStage = useStageSize()
const stageWidth = computed(() => props.width ?? externalStage.stageWidth.value)
const stageHeight = computed(() => props.height ?? externalStage.stageHeight.value)

/** Konva Stage 配置 */
const stageConfig = computed(() => ({
  width: stageWidth.value,
  height: stageHeight.value,
}))

// ── 连线创建交互 ──
const conn = useConnectionCreation(props.viewId)

// ── Stage 容器引用（用于 NodeTextEditor 坐标转换） ──
const stageContainerRef = ref<HTMLDivElement | null>(null)

// 主视图注册真实容器尺寸供 useStageSize 全局共享：
// 画布实际宽度受侧边栏挤压，按窗口估算会导致小地图视口指示、网格边界、新增节点定位偏移
onMounted(() => {
  view.containerEl = stageContainerRef.value
  if (props.width == null && stageContainerRef.value) {
    registerStageContainer(stageContainerRef.value)
  }
})
onUnmounted(() => {
  view.containerEl = null
  if (props.width == null) unregisterStageContainer()
})

/** Konva Stage 引用（用于获取底层 Konva 实例） */
const stageRef = ref<VueKonvaRef<Konva.Stage> | null>(null)

// ── 画布事件 ──
const canvasEvents = useCanvasEvents(props.viewId)
const { contextMenu } = canvasEvents

// ── 画布导航（平移 + 缩放） ──
const nav = useCanvasNavigation(props.viewId)

// ── 框选 ──
const marquee = useMarqueeSelection(props.viewId)

// ── 节点拖动 ──
const nodeDrag = useNodeDragging(props.viewId)
/** 拖动无连线节点悬于连线上的插入目标连线 id（模板自动解包） */
const insertTargetConnId = nodeDrag.insertTargetConnId

// ── 网格键盘交互（仅主视图实例化；内联视图不启用，置 null）──
const grid = props.viewId === 'main' ? useGridMode('main') : null

// ── 网格层（仅主视图启用）──

/**
 * 网格线：仅绘制视口可见范围内的网格线（世界坐标），随 viewport/缩放/gridMode 重绘。
 * 仅主视图启用，非主视图返回空。
 */
const gridLines = computed(() => {
  const vert: number[][] = []
  const horiz: number[][] = []
  if (props.viewId !== 'main' || !view.gridMode) return { vert, horiz }

  const scale = view.stageScale
  const g = GRID_G
  // 将屏幕四边换算为世界坐标（世界 = (屏幕 - stageX) / scale）
  const worldLeft = -view.stageX / scale
  const worldRight = (stageWidth.value - view.stageX) / scale
  const worldTop = -view.stageY / scale
  const worldBottom = (stageHeight.value - view.stageY) / scale

  const colStart = Math.floor(worldLeft / g)
  const colEnd = Math.ceil(worldRight / g)
  for (let c = colStart; c <= colEnd; c++) {
    const x = c * g
    vert.push([x, worldTop, x, worldBottom])
  }

  const rowStart = Math.floor(worldTop / g)
  const rowEnd = Math.ceil(worldBottom / g)
  for (let r = rowStart; r <= rowEnd; r++) {
    const y = r * g
    horiz.push([worldLeft, y, worldRight, y])
  }

  return { vert, horiz }
})

/** 活动格高亮矩形（中心对焦点，尺寸 G×G；未初始化或非主视图则 null） */
const activeGridRect = computed(() => {
  if (props.viewId !== 'main' || !view.gridMode || !view.activeGrid) return null
  return {
    x: view.activeGrid.x - GRID_G / 2,
    y: view.activeGrid.y - GRID_G / 2,
    width: GRID_G,
    height: GRID_G,
  }
})

/**
 * 开启网格时若 activeGrid 为 null（开启时无选中节点），
 * 在此按视口中心对应的世界坐标初始化焦点并调用 setActiveGrid（吸附到 G/2 倍数）。
 */
watch(
  () => view.gridMode,
  (on) => {
    if (on && view.activeGrid === null && props.viewId === 'main') {
      const scale = view.stageScale
      const cx = (stageWidth.value / 2 - view.stageX) / scale
      const cy = (stageHeight.value / 2 - view.stageY) / scale
      view.setActiveGrid(snapFocus(cx), snapFocus(cy))
    }
  },
)

// ── 当前视图数据（computed，保持响应式）──

/** 当前视图（viewedNodeId 节点）的直接子节点 */
const nodesArray = computed(() => nodeStore.childrenOf(view.viewedNodeId))

/** 当前视图的连线（viewedNodeId 节点的 connections） */
const connectionsArray = computed(() => nodeStore.getConnections(view.viewedNodeId))

// ── 全局 Transformer（替代每节点独立 Transformer） ──

/** 全局 Transformer 引用 */
const transformerRef = ref<VueKonvaRef<Konva.Transformer> | null>(null)

/** 全局 Transformer 配置 */
const transformerConfig = computed(() => ({
  anchorSize: TRANSFORMER_ANCHOR_SIZE,
  borderStroke: theme.scheme.canvas.transformerBorder,
  borderDash: TRANSFORMER_BORDER_DASH,
  // 配合 rect 的 strokeScaleEnabled:false，计算包围盒时忽略 stroke，
  // 避免缩放过程中包围盒/锚点因 stroke 宽度偏移
  ignoreStroke: true,
  enabledAnchors: [
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ] as const,
  rotateEnabled: false,
  keepRatio: false,
  /**
   * 禁止越界翻转：拖动柄越过对角线时 newBox 宽高会变负/过小，
   * 此时回退到 oldBox 阻止翻转。多节点时 box 为整体选择框。
   */
  boundBoxFunc: (
    oldBox: { x: number; y: number; width: number; height: number },
    newBox: { x: number; y: number; width: number; height: number },
  ) => {
    if (newBox.width < MIN_NODE_WIDTH || newBox.height < MIN_NODE_HEIGHT) {
      return oldBox
    }
    return newBox
  },
}))

/** 收集 WhiteboardNode 组件实例（id -> 实例），用于获取 Konva 节点供 Transformer 附着 / 层级调整 */
const nodeInstances = new Map<
  string,
  { getRectNode: () => Konva.Rect | null; getGroupNode: () => Konva.Group | null }
>()

/** v-for 节点的 ref 函数：挂载时收集实例，卸载时移除 */
function setNodeRef(id: string, el: unknown): void {
  if (el && typeof el === 'object' && 'getRectNode' in el) {
    nodeInstances.set(
      id,
      el as { getRectNode: () => Konva.Rect | null; getGroupNode: () => Konva.Group | null },
    )
  } else {
    nodeInstances.delete(id)
  }
}

/** 根据当前选中节点，收集其 Konva.Rect 并附着到全局 Transformer */
function attachTransformer(): void {
  const tr = transformerRef.value?.getNode()
  if (!tr) return
  const ids = Array.from(view.selectedNodeIds)
  const rects: Konva.Rect[] = []
  for (const id of ids) {
    const inst = nodeInstances.get(id)
    const rect = inst?.getRectNode?.()
    if (rect) rects.push(rect)
  }
  tr.nodes(rects)
  // 选中节点可能已通过 moveToTop 置顶，确保 Transformer 始终在最上层不被遮挡
  tr.moveToTop()
  tr.getLayer()?.batchDraw()
}

/**
 * 将所有内联视图宿主节点置顶到节点层最上层。
 *
 * 内联画布是 DOM 覆盖层（z-index:10），物理上始终浮在主 Stage Canvas 之上，
 * 主视图节点无法遮挡画布。但标题栏/边框是 Konva shape（与普通节点同层），
 * 会被普通节点遮挡——导致"能遮标题栏、遮不了画布"的视觉割裂。
 * 将内联视图宿主节点始终置于普通节点之上，使标题栏与画布层级一致（均不可被遮挡）。
 */
function liftInlineViewsToTop(): void {
  for (const iv of view.inlineViews) {
    nodeInstances.get(iv.nodeId)?.getGroupNode?.()?.moveToTop()
  }
}

/** 选中节点变化时：置顶选中节点 + 重新附着 Transformer（nextTick 确保子组件已渲染） */
watch(
  () => Array.from(view.selectedNodeIds),
  async () => {
    await nextTick()
    // 将选中节点移到节点层顶部，避免被其他节点遮挡
    for (const id of view.selectedNodeIds) {
      nodeInstances.get(id)?.getGroupNode?.()?.moveToTop()
    }
    // 内联视图宿主节点始终保持在选中节点之上（与内联画布 DOM 层级一致，避免视觉割裂）
    liftInlineViewsToTop()
    attachTransformer()
  },
)

/**
 * 内联视图展开/收起时：选中节点的渲染组件在 WhiteboardNode <-> InlineViewFrame 间切换，
 * selectedNodeIds 未变（上面的 watch 不触发），需在此重新附着 Transformer 到新组件的 Konva.Rect。
 * 监听 length 而非整个 inlineViews：展开(+1)/收起(-1) 触发，resize 仅改尺寸不触发。
 * nextTick 确保组件切换完成、nodeInstances 已更新为新实例。
 */
watch(
  () => view.inlineViews.length,
  async () => {
    await nextTick()
    // 内联视图宿主节点置顶（保持与画布 DOM 层级一致，避免视觉割裂）
    liftInlineViewsToTop()
    attachTransformer()
  },
)

/**
 * 节点列表变化时（新建/删除/undo-redo 恢复等）：vue-konva 将新增节点 append 到 layer 末尾，
 * 落在内联视图宿主节点之上。即便新增节点未被选中（如 undo 恢复），也需重新置顶内联视图，
 * 保证其始终位于普通节点之上。
 */
watch(
  () => nodesArray.value,
  async () => {
    await nextTick()
    liftInlineViewsToTop()
  },
)

/**
 * 全局 Transformer 变换结束：遍历所有附着节点，将 scale 烘焙为 width/height
 *
 * Konva Transformer resize 时只改节点的 scaleX/scaleY（不改 width/height），
 * 需在 transformend 时固化：newWidth = rect.width * scaleX，重置 scale=1。
 * 坐标：rect 在 v-group 内，worldX = node.x(=group.x) + rect.x()（group 内偏移）。
 */
function onTransformEnd(): void {
  const tr = transformerRef.value?.getNode()
  if (!tr) return
  const nodes = tr.nodes() // Konva.Rect[]
  for (const rect of nodes) {
    const group = rect.getParent()
    const nodeId = group?.name?.()
    if (!nodeId) continue

    const scaleX = rect.scaleX()
    const scaleY = rect.scaleY()

    // 区分：内联视图节点（同步节点尺寸入 undo + 更新视图尺寸）vs 普通节点（commitNodeResize 入 undo）
    if (view.getInlineViewRect(nodeId)) {
      // 内联视图节点：缩放矩形 = 同步更新节点尺寸（入 undo）+ 更新 inlineViews 尺寸（视图状态，不入 undo）
      let newWidth = Math.max(rect.width() * scaleX, INLINE_VIEW_MIN_WIDTH)
      let newHeight = Math.max(rect.height() * scaleY, INLINE_VIEW_MIN_HEIGHT)

      const nodeData = nodeStore.getNode(nodeId)
      // 捕获 resize 前的旧状态（用于 undo）
      const oldState = {
        x: nodeData?.x ?? 0,
        y: nodeData?.y ?? 0,
        width: nodeData?.width ?? 0,
        height: nodeData?.height ?? 0,
      }

      let worldX = (nodeData?.x ?? 0) + rect.x()
      let worldY = (nodeData?.y ?? 0) + rect.y()

      // 网格模式：尺寸向上取整百（snapSize）、位置四舍五入（snapPosition），
      // 使缩放后的节点落在网格上，吸附结果进入同一 commitNodeResize 历史。
      if (view.gridMode) {
        newWidth = snapSize(newWidth)
        newHeight = snapSize(newHeight)
        worldX = snapPosition(worldX)
        worldY = snapPosition(worldY)
      }

      // 重置 rect 的 scale 与 group 内偏移
      rect.x(0)
      rect.y(0)
      rect.scaleX(1)
      rect.scaleY(1)

      // 写入节点尺寸（setNodeSize 不触发 fitNodeToText，内联视图是容器需精确控制）
      nodeStore.setNodeSize(nodeId, worldX, worldY, newWidth, newHeight)

      // 捕获 resize 后的新状态，提交命令到历史栈
      const newNode = nodeStore.getNode(nodeId)
      const newState = {
        x: newNode?.x ?? 0,
        y: newNode?.y ?? 0,
        width: newNode?.width ?? 0,
        height: newNode?.height ?? 0,
      }
      commands.commitNodeResize(nodeId, oldState, newState)

      // 同步更新内联视图尺寸（视图状态，不入 undo）
      view.updateInlineViewSize(nodeId, newState.width, newState.height)
    } else {
      // 普通节点：将 scale 烘焙为 width/height，写入 store 并入 undo 栈
      let newWidth = Math.max(rect.width() * scaleX, MIN_NODE_WIDTH)
      let newHeight = Math.max(rect.height() * scaleY, MIN_NODE_HEIGHT)

      const node = nodeStore.getNode(nodeId)
      // 捕获 resize 前的旧状态（用于 undo）
      const oldState = {
        x: node?.x ?? 0,
        y: node?.y ?? 0,
        width: node?.width ?? 0,
        height: node?.height ?? 0,
      }

      let worldX = (node?.x ?? 0) + rect.x()
      let worldY = (node?.y ?? 0) + rect.y()

      // 网格模式：尺寸向上取整百（snapSize）、位置四舍五入（snapPosition）
      if (view.gridMode) {
        newWidth = snapSize(newWidth)
        newHeight = snapSize(newHeight)
        worldX = snapPosition(worldX)
        worldY = snapPosition(worldY)
      }

      // 重置 rect 的 scale 与 group 内偏移
      rect.x(0)
      rect.y(0)
      rect.scaleX(1)
      rect.scaleY(1)

      // 写入 store（resizeNode 内部会 fitNodeToText）
      nodeStore.resizeNode(nodeId, worldX, worldY, newWidth, newHeight)

      // 捕获 resize 后的新状态，提交命令到历史栈
      const newNode = nodeStore.getNode(nodeId)
      const newState = {
        x: newNode?.x ?? 0,
        y: newNode?.y ?? 0,
        width: newNode?.width ?? 0,
        height: newNode?.height ?? 0,
      }
      commands.commitNodeResize(nodeId, oldState, newState)
    }
  }
  // 烘焙后重新附着 Transformer 适应新尺寸
  attachTransformer()
  tr.getLayer()?.batchDraw()
}

// ── 编辑中的节点数据（传递给 NodeTextEditor） ──
const editingNode = computed(() => {
  if (!view.editingNodeId) return null
  return nodeStore.getNode(view.editingNodeId) ?? null
})

// ── 编辑操作方法 ──

/** 开始编辑指定节点（用于双击已有节点） */
function startTextEdit(nodeId: string): void {
  view.startEditing(nodeId)
}

/** 完成文本编辑（保存）-- 通过命令层 setNodeText 入历史栈，再清除编辑态 */
function finishTextEdit(nodeId: string, text: string): void {
  commands.setNodeText(nodeId, text)
  view.stopEditing()
}

/** 取消文本编辑 */
function cancelTextEdit(): void {
  view.stopEditing()
}

/** 点击引用片段：跳转到被引用节点子视图 */
function handleReferenceClick(targetNodeId: string): void {
  project.switchView(targetNodeId)
}

// ── 连线选中 ──

/** 连线点击：选中或取消选中（支持 Ctrl 多选） */
function handleConnectionClick(connectionId: string, ctrlKey?: boolean): void {
  if (ctrlKey) {
    view.selectConnection(connectionId, true)
  } else {
    if (view.selectedConnectionIds.has(connectionId)) {
      view.selectConnection(null)
    } else {
      view.selectConnection(connectionId)
    }
  }
}

// ── 连线文字编辑 ──

/** 正在编辑文字的连线数据（全局查找，支持跨视图选中） */
const editingConnection = computed(() => {
  if (!view.editingConnectionId) return null
  return nodeStore.findConnectionById(view.editingConnectionId)
})

/** 正在编辑连线的两端中点坐标（世界坐标） */
const editingConnectionMid = computed(() => {
  const ec = editingConnection.value
  if (!ec) return null
  const from = nodeStore.getNode(ec.connection.fromNodeId)
  const to = nodeStore.getNode(ec.connection.toNodeId)
  if (!from || !to) return null
  return {
    x: (from.x + from.width / 2 + to.x + to.width / 2) / 2,
    y: (from.y + from.height / 2 + to.y + to.height / 2) / 2,
  }
})

/** 连线双击 -> 开始编辑连线文字 */
function handleConnectionDblClick(connectionId: string): void {
  view.startEditingConnection(connectionId)
}

/** 完成连线文字编辑（空文字转为 null）-- 经命令层 updateConnection 入历史栈 */
function finishConnectionTextEdit(connectionId: string, text: string): void {
  const ec = nodeStore.findConnectionById(connectionId)
  if (ec) {
    const value = text.trim() === '' ? null : text
    commands.updateConnection(ec.parentId, connectionId, { text: value })
  }
  view.stopEditingConnection()
}

/** 取消连线文字编辑 */
function cancelConnectionTextEdit(): void {
  view.stopEditingConnection()
}

// ── Stage 事件包装 ──

/** 处理画布点击：框选命中后跳过取消选中（避免清空刚框选的节点） */
function handleStageClick(e: unknown): void {
  const ke = e as KonvaEventObject<MouseEvent>
  // 仅响应左键；右键不取消选中（留给 contextmenu 打开菜单），也不消耗 suppressNextClick
  if (ke.evt.button !== 0) return
  if (marquee.suppressNextClick.value) {
    marquee.suppressNextClick.value = false
    return
  }
  canvasEvents.handleStageClick(ke)
}

/** 处理画布右键菜单 */
function handleStageContextMenu(e: unknown): void {
  canvasEvents.handleStageContextMenu(e as KonvaEventObject<MouseEvent>)
}

/** 右键菜单选中项：执行其 action 并关闭 */
function handleContextMenuSelect(item: ContextMenuItem): void {
  item.action?.()
  contextMenu.close()
}

/** 右键菜单关闭 */
function handleContextMenuClose(): void {
  contextMenu.close()
}

/** 处理滚轮缩放（Ctrl + 滚轮） */
function handleStageWheel(e: unknown): void {
  nav.handleWheel(e as KonvaEventObject<WheelEvent>)
}

/** 处理 Stage 拖拽平移中 */
function handleStageDragMove(e: unknown): void {
  nav.handleDragMove(e as KonvaEventObject<DragEvent>)
}

/** 处理 Stage 拖拽平移结束 */
function handleStageDragEnd(e: unknown): void {
  nav.handleDragEnd(e as KonvaEventObject<DragEvent>)
}

/**
 * 网格模式下：把鼠标点击的世界坐标吸附到 50 倍数后同步活动网格（设计 §3.2）。
 * 点击与双击（双击触发两次 mousedown）均会移动活动网格；
 * 双击新建节点时节点中心即鼠标位置，因此 activeGrid 落在该节点中心（吸附后）一致。
 */
function syncActiveGridToPointer(e: KonvaEventObject<MouseEvent>): void {
  if (!view.gridMode || view.type !== 'main') return
  const stage = e.target.getStage()
  const pos = stage?.getRelativePointerPosition()
  if (pos) view.setActiveGrid(snapFocus(pos.x), snapFocus(pos.y))
}

// ── 鼠标事件分流：连线创建 / 节点拖动 / 框选 / 平移 ──

/** mousedown：Shift 走连线创建，PanMode 走平移，命中节点走拖动，空白走框选 */
function handleStageMouseDown(e: unknown): void {
  const ke = e as KonvaEventObject<MouseEvent>
  // 网格模式下：鼠标点击同步活动网格（焦点吸附到 50 倍数）
  if (ke.evt.button === 0) syncActiveGridToPointer(ke)
  // 键盘连线预览激活时（grid?.isGridConnecting），Shift 连线语义让渡给键盘预览，
  // 鼠标 mousedown 落到 nodeDrag/marquee 普通选中/框选，避免鼠标连线抢占（设计"鼠标点击切换活动网格"）。
  if (conn.isShiftHeld.value && !grid?.isGridConnecting.value) {
    conn.handleMouseDown(ke)
    return
  }
  if (nav.isPanMode.value) return
  // 命中节点则由节点拖动接管，否则交给框选
  if (nodeDrag.handleMouseDown(ke)) return
  marquee.handleMouseDown(ke)
}

/** mousemove：连线创建中优先；节点拖动中优先；否则交给框选（激活前也需接收 move 以超过阈值激活） */
function handleStageMouseMove(e: unknown): void {
  const ke = e as KonvaEventObject<MouseEvent>
  // 连线创建拖拽中（Shift 模式）优先处理临时连线终点
  if (view.connectingFrom !== null) {
    conn.handleMouseMove(ke)
    return
  }
  // 节点拖动：内部判断 pendingStart 是否存在，不存在时 no-op
  nodeDrag.handleMouseMove(ke)
  // 节点拖动激活后不再交给框选（两者 pending 互斥，但显式判断更清晰）
  if (!nodeDrag.isDragging.value) {
    marquee.handleMouseMove(ke)
  }
}

/** mouseup：三者各自内部判断状态并清理 */
function handleStageMouseUp(e: unknown): void {
  const ke = e as KonvaEventObject<MouseEvent>
  nodeDrag.handleMouseUp(ke)
  marquee.handleMouseUp(ke)
  conn.handleMouseUp(ke)
}
</script>

<template>
  <div
    ref="stageContainerRef"
    class="canvas-wrapper"
    :class="{ 'pan-mode': nav.isPanMode.value, 'shift-held': conn.isShiftHeld.value }"
    :style="{ backgroundColor: theme.scheme.canvas.background }"
  >
    <!-- Konva Stage -->
    <v-stage
      ref="stageRef"
      :config="stageConfig"
      :x="view.stageX"
      :y="view.stageY"
      :scaleX="view.stageScale"
      :scaleY="view.stageScale"
      :draggable="nav.isPanMode.value"
      @click="handleStageClick"
      @contextmenu="handleStageContextMenu"
      @wheel="handleStageWheel"
      @dragmove="handleStageDragMove"
      @dragend="handleStageDragEnd"
      @mousedown="handleStageMouseDown"
      @mousemove="handleStageMouseMove"
      @mouseup="handleStageMouseUp"
    >
      <!-- 网格层（最底层，仅主视图启用）：listening:false 不参与事件，仅视觉 -->
      <v-layer v-if="view.gridMode && view.type === 'main'" :config="{ listening: false }">
        <!-- 纵向网格线 -->
        <v-line
          v-for="(pts, i) in gridLines.vert"
          :key="'grid-v-' + i"
          :config="{
            points: pts,
            stroke: theme.scheme.canvas.gridLine,
            strokeWidth: 1 / view.stageScale,
          }"
        />
        <!-- 横向网格线 -->
        <v-line
          v-for="(pts, i) in gridLines.horiz"
          :key="'grid-h-' + i"
          :config="{
            points: pts,
            stroke: theme.scheme.canvas.gridLine,
            strokeWidth: 1 / view.stageScale,
          }"
        />
      </v-layer>

      <!-- 连线层（底层）：独立 layer 确保节点层始终覆盖在连线之上，
           不受 v-for 列表更新导致的 Konva children 重排影响 -->
      <v-layer>
        <!--
          连线 - 位于独立连线层（底层），每条连线渲染为线段 + 可选箭头（有向时）。
        -->
        <WhiteboardConnection
          v-for="connItem in connectionsArray"
          :key="connItem.id"
          :connection-id="connItem.id"
          :parent-id="view.viewedNodeId"
          :is-selected="view.selectedConnectionIds.has(connItem.id)"
          :is-insert-target="insertTargetConnId === connItem.id"
          @click="handleConnectionClick"
          @dblclick="handleConnectionDblClick"
        />

        <!-- 临时连线（拖拽创建中，虚线）——网格键盘预览激活时不渲染鼠标线，避免两条重叠 -->
        <v-line
          v-if="view.connectingFrom !== null && !grid?.isGridConnecting.value"
          :config="conn.tempConnConfig.value"
        />

        <!-- 网格键盘连线预览临时线（Shift+方向键，仅主视图；与上方鼠标临时线互斥） -->
        <v-line
          v-if="grid?.isGridConnecting.value"
          :config="grid?.gridTempConn.value"
        />
      </v-layer>

      <!-- 节点层（上层）：节点 + Transformer + 框选矩形 -->
      <v-layer>
        <!-- 节点列表（上层，覆盖连线）：展开内联视图的节点用 InlineViewFrame 替代 WhiteboardNode -->
        <template v-for="node in nodesArray" :key="node.id">
          <InlineViewFrame
            v-if="view.getInlineViewRect(node.id)"
            :ref="(el: unknown) => setNodeRef(node.id, el)"
            :node-id="node.id"
            :view-id="viewId"
            @dblclick="startTextEdit"
          />
          <WhiteboardNode
            v-else
            :ref="(el: unknown) => setNodeRef(node.id, el)"
            :node-id="node.id"
            @dblclick="startTextEdit"
            @reference-click="handleReferenceClick"
          />
        </template>
        
        <!-- 活动格高亮（中心对焦点，半透明填充 + 描边） -->
        <v-rect
          v-if="activeGridRect"
          :config="{
            ...activeGridRect,
            fill: theme.scheme.canvas.activeGrid,
            stroke: theme.scheme.canvas.activeGrid,
            strokeWidth: 1 / view.stageScale,
          }"
        />

        <!-- 全局 Transformer：单选/多选统一变换（替代每节点独立 Transformer） -->
        <v-transformer
          ref="transformerRef"
          :config="transformerConfig"
          @transformend="onTransformEnd"
        />

        <!-- 框选矩形（listening:false 不参与事件，仅视觉） -->
        <v-rect
          v-if="marquee.isMarqueeDragging.value"
          :config="marquee.marqueeRectConfig.value"
        />
      </v-layer>
    </v-stage>

    <!-- 文本编辑器覆盖层 -->
    <NodeTextEditor
      v-if="view.editingNodeId && editingNode"
      :key="view.editingNodeId"
      :node-id="view.editingNodeId"
      :initial-text="editingNode.text"
      :node-x="editingNode.x"
      :node-y="editingNode.y"
      :node-width="editingNode.width"
      :node-height="editingNode.height"
      :stage-scale="view.stageScale"
      :stage-x="view.stageX"
      :stage-y="view.stageY"
      :stage-container="stageContainerRef!"
      @save="finishTextEdit"
      @cancel="cancelTextEdit"
    />

    <!-- 连线文字编辑器覆盖层 -->
    <ConnectionTextEditor
      v-if="view.editingConnectionId && editingConnection && editingConnectionMid"
      :key="view.editingConnectionId"
      :connection-id="view.editingConnectionId"
      :initial-text="editingConnection.connection.text ?? ''"
      :mid-x="editingConnectionMid.x"
      :mid-y="editingConnectionMid.y"
      :conn-color="editingConnection.connection.strokeColor"
      :stage-scale="view.stageScale"
      :stage-x="view.stageX"
      :stage-y="view.stageY"
      @save="finishConnectionTextEdit"
      @cancel="cancelConnectionTextEdit"
    />

    <!-- 内联视图 DOM 覆盖层（每个展开的内联视图一个独立 CanvasStage） -->
    <InlineViewCanvas
      v-for="iv in view.inlineViews"
      :key="iv.viewId"
      :view-id="iv.viewId"
      :host-view-id="viewId"
      :node-id="iv.nodeId"
    />

    <!-- 右下角导航小地图（仅主视图显示） -->
    <OverviewMap v-if="showOverviewMap" />

    <!-- 右键上下文菜单 -->
    <ContextMenu
      :visible="contextMenu.visible.value"
      :x="contextMenu.x.value"
      :y="contextMenu.y.value"
      :items="contextMenu.items.value"
      @select="handleContextMenuSelect"
      @close="handleContextMenuClose"
    />
  </div>
</template>

<style scoped>
.canvas-wrapper {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.canvas-wrapper.pan-mode {
  cursor: grab;
}

.canvas-wrapper.pan-mode:active {
  cursor: grabbing;
}

.canvas-wrapper.shift-held {
  cursor: crosshair;
}
</style>
