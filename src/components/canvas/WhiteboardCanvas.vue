<script setup lang="ts">
/**
 * WhiteboardCanvas - 白板主画布组件
 *
 * 核心集成组件，负责：
 * 1. 渲染 Konva Stage 和所有节点
 * 2. 管理内联文本编辑器的生命周期（editingNodeId 状态）
 * 3. 连接所有 composables 到 Store
 * 4. 编排节点、连线与编辑器之间的交互
 *
 * 数据源：nodeStore（全局节点树 + 连线）+ viewStore（当前视图的视口/选中/编辑）。
 * 当前视图渲染的是 activeViewId 节点的直接子节点与它们之间的连线。
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useActiveView } from '@/composables/useActiveView'
import { useStageSize } from '@/composables/useStageSize'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useCanvasEvents } from '@/composables/useCanvasEvents'
import { useCanvasNavigation } from '@/composables/useCanvasNavigation'
import { useConnectionCreation } from '@/composables/useConnectionCreation'
import { useMarqueeSelection } from '@/composables/useMarqueeSelection'
import { useNodeDragging } from '@/composables/useNodeDragging'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { VueKonvaRef } from 'vue-konva'
import type Konva from 'konva'
import {
  CANVAS_BACKGROUND_COLOR,
  MIN_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  TRANSFORMER_ANCHOR_SIZE,
  TRANSFORMER_BORDER_STROKE,
  TRANSFORMER_BORDER_DASH,
} from '@/constants'
import WhiteboardNode from './WhiteboardNode.vue'
import WhiteboardConnection from './WhiteboardConnection.vue'
import NodeTextEditor from './NodeTextEditor.vue'
import OverviewMap from './OverviewMap.vue'
import ContextMenu from './ContextMenu.vue'
import type { ContextMenuItem } from '@/composables/useContextMenu'

// ── Store ──
const active = useActiveView()

// ── Stage 尺寸 ──
const stage = useStageSize()

/** Konva Stage 配置 */
const stageConfig = computed(() => ({
  width: stage.stageWidth.value,
  height: stage.stageHeight.value,
}))

// ── 连线创建交互 ──
const conn = useConnectionCreation()

// ── Stage 容器引用（用于 NodeTextEditor 坐标转换） ──
const stageContainerRef = ref<HTMLDivElement | null>(null)

/** Konva Stage 引用（用于获取底层 Konva 实例） */
const stageRef = ref<VueKonvaRef<Konva.Stage> | null>(null)

// ── 文本编辑状态 ──
/** 是否正在编辑（用于禁用快捷键） */
const isEditing = computed(() => active.view.editingNodeId !== null)

// ── 快捷键（编辑状态下禁用） ──
useKeyboardShortcuts(isEditing)

// ── 画布事件 ──
const canvasEvents = useCanvasEvents()
const { contextMenu } = canvasEvents

// ── 画布导航（平移 + 缩放） ──
const nav = useCanvasNavigation()

// ── 框选 ──
const marquee = useMarqueeSelection()

// ── 节点拖动 ──
const nodeDrag = useNodeDragging()

// ── 当前视图数据（computed，保持响应式）──

/** 当前视图（activeViewId 节点）的直接子节点 */
const nodesArray = computed(() => active.nodeStore.childrenOf(active.project.activeViewId))

/** 当前视图的连线（activeViewId 节点的 connections） */
const connectionsArray = computed(() => active.nodeStore.getConnections(active.project.activeViewId))

// ── 全局 Transformer（替代每节点独立 Transformer） ──

/** 全局 Transformer 引用 */
const transformerRef = ref<VueKonvaRef<Konva.Transformer> | null>(null)

/** 全局 Transformer 配置 */
const transformerConfig = {
  anchorSize: TRANSFORMER_ANCHOR_SIZE,
  borderStroke: TRANSFORMER_BORDER_STROKE,
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
}

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
  const ids = Array.from(active.view.selectedNodeIds)
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

/** 选中节点变化时：置顶选中节点 + 重新附着 Transformer（nextTick 确保子组件已渲染） */
watch(
  () => Array.from(active.view.selectedNodeIds),
  async () => {
    await nextTick()
    // 将选中节点移到节点层顶部，避免被其他节点遮挡
    for (const id of active.view.selectedNodeIds) {
      nodeInstances.get(id)?.getGroupNode?.()?.moveToTop()
    }
    attachTransformer()
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
    const newWidth = Math.max(rect.width() * scaleX, MIN_NODE_WIDTH)
    const newHeight = Math.max(rect.height() * scaleY, MIN_NODE_HEIGHT)

    const node = active.nodeStore.getNode(nodeId)
    const worldX = (node?.x ?? 0) + rect.x()
    const worldY = (node?.y ?? 0) + rect.y()

    // 重置 rect 的 scale 与 group 内偏移
    rect.x(0)
    rect.y(0)
    rect.scaleX(1)
    rect.scaleY(1)

    // 写入 store（resizeNode 内部会 fitNodeToText）
    active.nodeStore.resizeNode(nodeId, worldX, worldY, newWidth, newHeight)
  }
  // 烘焙后重新附着 Transformer 适应新尺寸
  attachTransformer()
  tr.getLayer()?.batchDraw()
}

// ── 编辑中的节点数据（传递给 NodeTextEditor） ──
const editingNode = computed(() => {
  if (!active.view.editingNodeId) return null
  return active.nodeStore.getNode(active.view.editingNodeId) ?? null
})

// ── 编辑操作方法 ──

/** 开始编辑指定节点（用于双击已有节点） */
function startTextEdit(nodeId: string): void {
  active.view.startEditing(nodeId)
}

/** 完成文本编辑（保存）-- setNodeText 仅改数据，需手动清除编辑态 */
function finishTextEdit(nodeId: string, text: string): void {
  active.nodeStore.setNodeText(nodeId, text)
  active.view.stopEditing()
}

/** 取消文本编辑 */
function cancelTextEdit(): void {
  active.view.stopEditing()
}

// ── 连线选中 ──

/** 连线点击：选中或取消选中（支持 Ctrl 多选） */
function handleConnectionClick(connectionId: string, ctrlKey?: boolean): void {
  if (ctrlKey) {
    active.view.selectConnection(connectionId, true)
  } else {
    if (active.view.selectedConnectionIds.has(connectionId)) {
      active.view.selectConnection(null)
    } else {
      active.view.selectConnection(connectionId)
    }
  }
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

/** 处理画布双击 */
function handleStageDblClick(e: unknown): void {
  canvasEvents.handleStageDblClick(e as KonvaEventObject<MouseEvent>)
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

// ── 鼠标事件分流：连线创建 / 节点拖动 / 框选 / 平移 ──

/** mousedown：Shift 走连线创建，PanMode 走平移，命中节点走拖动，空白走框选 */
function handleStageMouseDown(e: unknown): void {
  const ke = e as KonvaEventObject<MouseEvent>
  if (conn.isShiftHeld.value) {
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
  if (active.view.connectingFrom !== null) {
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
  >
    <!-- Konva Stage -->
    <v-stage
      ref="stageRef"
      :config="stageConfig"
      :x="active.view.stageX"
      :y="active.view.stageY"
      :scaleX="active.view.stageScale"
      :scaleY="active.view.stageScale"
      :draggable="nav.isPanMode.value"
      @click="handleStageClick"
      @dblclick="handleStageDblClick"
      @contextmenu="handleStageContextMenu"
      @wheel="handleStageWheel"
      @dragmove="handleStageDragMove"
      @dragend="handleStageDragEnd"
      @mousedown="handleStageMouseDown"
      @mousemove="handleStageMouseMove"
      @mouseup="handleStageMouseUp"
    >
      <!-- 连线层（底层）：独立 layer 确保节点层始终覆盖在连线之上，
           不受 v-for 列表更新导致的 Konva children 重排影响 -->
      <v-layer>
        <!-- 背景矩形 -->
        <v-rect
          :config="{
            width: stage.stageWidth.value,
            height: stage.stageHeight.value,
            fill: CANVAS_BACKGROUND_COLOR,
            listening: false,
          }"
        />

        <!--
          连线 - 位于独立连线层（底层），每条连线渲染为线段 + 可选箭头（有向时）。
        -->
        <WhiteboardConnection
          v-for="connItem in connectionsArray"
          :key="connItem.id"
          :connection-id="connItem.id"
          :is-selected="active.view.selectedConnectionIds.has(connItem.id)"
          @click="handleConnectionClick"
        />

        <!-- 临时连线（拖拽创建中，虚线） -->
        <v-line
          v-if="active.view.connectingFrom !== null"
          :config="conn.tempConnConfig.value"
        />
      </v-layer>

      <!-- 节点层（上层）：节点 + Transformer + 框选矩形 -->
      <v-layer>
        <!-- 节点列表（上层，覆盖连线） -->
        <WhiteboardNode
          v-for="node in nodesArray"
          :key="node.id"
          :ref="(el: unknown) => setNodeRef(node.id, el)"
          :node-id="node.id"
          :is-selected="active.view.selectedNodeIds.has(node.id)"
          @dblclick="startTextEdit"
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
      v-if="active.view.editingNodeId && editingNode"
      :key="active.view.editingNodeId"
      :node-id="active.view.editingNodeId"
      :initial-text="editingNode.text"
      :node-x="editingNode.x"
      :node-y="editingNode.y"
      :node-width="editingNode.width"
      :node-height="editingNode.height"
      :stage-scale="active.view.stageScale"
      :stage-x="active.view.stageX"
      :stage-y="active.view.stageY"
      :stage-container="stageContainerRef!"
      @save="finishTextEdit"
      @cancel="cancelTextEdit"
    />

    <!-- 右下角导航小地图 -->
    <OverviewMap />

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
