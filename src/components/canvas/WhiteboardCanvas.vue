<script setup lang="ts">
/**
 * WhiteboardCanvas - 白板主画布组件
 *
 * 核心集成组件，负责：
 * 1. 渲染 Konva Stage 和所有节点
 * 2. 管理内联文本编辑器的生命周期（editingNodeId 状态）
 * 3. 连接所有 composables 到 Store
 * 4. 编排节点、连线与编辑器之间的交互
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import { useStageSize } from '@/composables/useStageSize'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useCanvasEvents } from '@/composables/useCanvasEvents'
import { useCanvasNavigation } from '@/composables/useCanvasNavigation'
import { useConnectionCreation } from '@/composables/useConnectionCreation'
import { useMarqueeSelection } from '@/composables/useMarqueeSelection'
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

// ── Store ──
const active = useActiveWhiteboard()

// ── Stage 尺寸 ──
const { stageWidth, stageHeight } = useStageSize()

/** Konva Stage 配置 */
const stageConfig = computed(() => ({
  width: stageWidth.value,
  height: stageHeight.value,
}))

// ── 连线创建交互 ──
// 注意：模板中使用的 ref/computed 必须解构到顶层以触发 Vue 模板自动解包
const {
  isShiftHeld,
  tempConnConfig,
  handleMouseDown: connMouseDown,
  handleMouseMove: connMouseMove,
  handleMouseUp: connMouseUp,
  setup: connSetup,
  teardown: connTeardown,
} = useConnectionCreation()

// ── Stage 容器引用（用于 NodeTextEditor 坐标转换） ──
const stageContainerRef = ref<HTMLDivElement | null>(null)

/** Konva Stage 引用（用于获取底层 Konva 实例） */
const stageRef = ref<VueKonvaRef<Konva.Stage> | null>(null)

// ── 生命周期：注册/注销连线创建键盘事件 ──
onMounted(() => {
  connSetup()
})

onUnmounted(() => {
  connTeardown()
})

// ── 文本编辑状态 ──
/** 是否正在编辑（用于禁用快捷键） */
const isEditing = computed(() => active.board.editingNodeId !== null)

// ── 快捷键（编辑状态下禁用） ──
useKeyboardShortcuts(isEditing)

// ── 画布事件 ──
const canvasEvents = useCanvasEvents()

// ── 画布导航（平移 + 缩放） ──
const nav = useCanvasNavigation()

// ── 框选 ──
const marquee = useMarqueeSelection()
// 解构响应式属性供模板自动解包
const { isMarqueeDragging, marqueeRectConfig } = marquee

// ── 全局 Transformer（替代每节点独立 Transformer） ──

/** 全局 Transformer 引用 */
const transformerRef = ref<VueKonvaRef<Konva.Transformer> | null>(null)

/** 全局 Transformer 配置 */
const transformerConfig = {
  anchorSize: TRANSFORMER_ANCHOR_SIZE,
  borderStroke: TRANSFORMER_BORDER_STROKE,
  borderDash: TRANSFORMER_BORDER_DASH,
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

/** 收集 WhiteboardNode 组件实例（id -> 实例），用于获取 Konva.Rect 供 Transformer 附着 */
const nodeInstances = new Map<string, { getRectNode: () => Konva.Rect | null }>()

/** v-for 节点的 ref 函数：挂载时收集实例，卸载时移除 */
function setNodeRef(id: string, el: unknown): void {
  if (el && typeof el === 'object' && 'getRectNode' in el) {
    nodeInstances.set(id, el as { getRectNode: () => Konva.Rect | null })
  } else {
    nodeInstances.delete(id)
  }
}

/** 根据当前选中节点，收集其 Konva.Rect 并附着到全局 Transformer */
function attachTransformer(): void {
  const tr = transformerRef.value?.getNode()
  if (!tr) return
  const ids = Array.from(active.board.selectedNodeIds)
  const rects: Konva.Rect[] = []
  for (const id of ids) {
    const inst = nodeInstances.get(id)
    const rect = inst?.getRectNode?.()
    if (rect) rects.push(rect)
  }
  tr.nodes(rects)
  tr.getLayer()?.batchDraw()
}

/** 选中节点变化时重新附着 Transformer（nextTick 确保子组件已渲染） */
watch(
  () => Array.from(active.board.selectedNodeIds),
  async () => {
    await nextTick()
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

    const node = active.board.nodes.get(nodeId)
    const worldX = (node?.x ?? 0) + rect.x()
    const worldY = (node?.y ?? 0) + rect.y()

    // 重置 rect 的 scale 与 group 内偏移
    rect.x(0)
    rect.y(0)
    rect.scaleX(1)
    rect.scaleY(1)

    // 写入 store（resizeNode 内部会 fitNodeToText）
    active.board.resizeNode(nodeId, worldX, worldY, newWidth, newHeight)
  }
  // 烘焙后重新附着 Transformer 适应新尺寸
  attachTransformer()
  tr.getLayer()?.batchDraw()
}

// ── 编辑中的节点数据（传递给 NodeTextEditor） ──
const editingNode = computed(() => {
  if (!active.board.editingNodeId) return null
  return active.board.nodes.get(active.board.editingNodeId) ?? null
})

// ── 编辑操作方法 ──

/** 开始编辑指定节点（用于双击已有节点） */
function startTextEdit(nodeId: string): void {
  active.board.startEditing(nodeId)
}

/** 完成文本编辑（保存）—— active.board.setNodeText 内部已清除编辑状态 */
function finishTextEdit(nodeId: string, text: string): void {
  active.board.setNodeText(nodeId, text)
}

/** 取消文本编辑 */
function cancelTextEdit(): void {
  active.board.stopEditing()
}

// ── 连线选中 ──

/** 连线点击：选中或取消选中（支持 Ctrl 多选） */
function handleConnectionClick(connectionId: string, ctrlKey?: boolean): void {
  if (ctrlKey) {
    active.board.selectConnection(connectionId, true)
  } else {
    if (active.board.selectedConnectionIds.has(connectionId)) {
      active.board.selectConnection(null)
    } else {
      active.board.selectConnection(connectionId)
    }
  }
}

// ── Stage 事件包装 ──

/** 处理画布点击：框选命中后跳过取消选中（避免清空刚框选的节点） */
function handleStageClick(e: unknown): void {
  if (marquee.suppressNextClick.value) {
    marquee.suppressNextClick.value = false
    return
  }
  canvasEvents.handleStageClick(e as KonvaEventObject<MouseEvent>)
}

/** 处理画布双击 */
function handleStageDblClick(e: unknown): void {
  canvasEvents.handleStageDblClick(e as KonvaEventObject<MouseEvent>)
}

/** 处理画布右键菜单 */
function handleStageContextMenu(e: unknown): void {
  canvasEvents.handleStageContextMenu(e as KonvaEventObject<MouseEvent>)
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

// ── 鼠标事件分流：框选 / 连线创建 / 平移 ──

/** mousedown：Shift 走连线创建，PanMode 走平移，其余空白走框选 */
function handleStageMouseDown(e: unknown): void {
  const ke = e as KonvaEventObject<MouseEvent>
  if (isShiftHeld.value) {
    connMouseDown(ke)
    return
  }
  if (nav.isPanMode.value) return
  marquee.handleMouseDown(ke)
}

/** mousemove：连线创建模式优先；否则交给框选（框选激活前也需接收 move 以超过阈值激活） */
function handleStageMouseMove(e: unknown): void {
  const ke = e as KonvaEventObject<MouseEvent>
  // 连线创建拖拽中（Shift 模式）优先处理临时连线终点
  if (active.board.connectingFrom !== null) {
    connMouseMove(ke)
    return
  }
  // 否则交给框选：内部 pendingStart 不存在时 no-op；
  // 存在时检测阈值并激活。注意不能仅凭 isMarqueeDragging 分流，
  // 否则激活前 handleMouseMove 永不执行，框选陷入死锁无法启动。
  marquee.handleMouseMove(ke)
}

/** mouseup：始终调用 marquee.handleMouseUp（内部判断并清理状态），再走连线收尾 */
function handleStageMouseUp(e: unknown): void {
  const ke = e as KonvaEventObject<MouseEvent>
  marquee.handleMouseUp(ke)
  connMouseUp(ke)
}
</script>

<template>
  <div
    ref="stageContainerRef"
    class="canvas-wrapper"
    :class="{ 'pan-mode': nav.isPanMode.value, 'shift-held': isShiftHeld }"
  >
    <!-- Konva Stage -->
    <v-stage
      ref="stageRef"
      :config="stageConfig"
      :x="active.board.stageX"
      :y="active.board.stageY"
      :scaleX="active.board.stageScale"
      :scaleY="active.board.stageScale"
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
      <v-layer>
        <!-- 背景矩形 -->
        <v-rect
          :config="{
            width: stageWidth,
            height: stageHeight,
            fill: CANVAS_BACKGROUND_COLOR,
            listening: false,
          }"
        />

        <!--
          连线 — 渲染在节点之前（底层），使节点始终覆盖在连线之上。
          每条连线渲染为线段 + 可选箭头（有向时）。
        -->
        <WhiteboardConnection
          v-for="connId in active.board.connections.keys()"
          :key="connId"
          :connection-id="connId"
          :is-selected="active.board.selectedConnectionIds.has(connId)"
          @click="handleConnectionClick"
        />

        <!-- 临时连线（拖拽创建中，虚线） -->
        <v-line
          v-if="active.board.connectingFrom !== null"
          :config="tempConnConfig"
        />

        <!-- 节点列表（上层，覆盖连线） -->
        <WhiteboardNode
          v-for="node in active.board.nodesArray"
          :key="node.id"
          :ref="(el: unknown) => setNodeRef(node.id, el)"
          :node-id="node.id"
          :is-selected="active.board.selectedNodeIds.has(node.id)"
          :draggable="!isShiftHeld && !nav.isPanMode.value"
          @select="(nodeId: string, ctrlKey?: boolean) => active.board.selectNode(nodeId, ctrlKey)"
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
          v-if="isMarqueeDragging"
          :config="marqueeRectConfig"
        />
      </v-layer>
    </v-stage>

    <!-- 文本编辑器覆盖层 -->
    <NodeTextEditor
      v-if="active.board.editingNodeId && editingNode"
      :key="active.board.editingNodeId"
      :node-id="active.board.editingNodeId"
      :initial-text="editingNode.text"
      :node-x="editingNode.x"
      :node-y="editingNode.y"
      :node-width="editingNode.width"
      :node-height="editingNode.height"
      :stage-scale="active.board.stageScale"
      :stage-x="active.board.stageX"
      :stage-y="active.board.stageY"
      :stage-container="stageContainerRef!"
      @save="finishTextEdit"
      @cancel="cancelTextEdit"
    />

    <!-- 右下角导航小地图 -->
    <OverviewMap />
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
