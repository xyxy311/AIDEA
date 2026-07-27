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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import { useStageSize } from '@/composables/useStageSize'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useCanvasEvents } from '@/composables/useCanvasEvents'
import { useCanvasNavigation } from '@/composables/useCanvasNavigation'
import { useConnectionCreation } from '@/composables/useConnectionCreation'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { VueKonvaRef } from 'vue-konva'
import type Konva from 'konva'
import { CANVAS_BACKGROUND_COLOR } from '@/constants'
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

// ── 编辑中的节点数据（传递给 NodeTextEditor） ──
const editingNode = computed(() => {
  if (!active.board.editingNodeId) return null
  return active.board.nodesArray.find((n) => n.id === active.board.editingNodeId) ?? null
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

/** 处理画布点击 */
function handleStageClick(e: unknown): void {
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

// ── 连线创建事件（委托给 useConnectionCreation composable） ──

function handleStageMouseDown(e: unknown): void {
  connMouseDown(e as KonvaEventObject<MouseEvent>)
}

function handleStageMouseMove(e: unknown): void {
  connMouseMove(e as KonvaEventObject<MouseEvent>)
}

function handleStageMouseUp(e: unknown): void {
  connMouseUp(e as KonvaEventObject<MouseEvent>)
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
          :node-id="node.id"
          :is-selected="active.board.selectedNodeIds.has(node.id)"
          :draggable="!isShiftHeld && !nav.isPanMode.value"
          @select="(nodeId: string, ctrlKey?: boolean) => active.board.selectNode(nodeId, ctrlKey)"
          @dblclick="startTextEdit"
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
