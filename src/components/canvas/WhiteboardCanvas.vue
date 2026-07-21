<script setup lang="ts">
/**
 * WhiteboardCanvas - 白板主画布组件
 *
 * 核心集成组件，负责：
 * 1. 渲染 Konva Stage 和所有节点
 * 2. 管理内联文本编辑器的生命周期（editingNodeId 状态）
 * 3. 连接所有 composables 到 Store
 * 4. 编排节点与编辑器之间的交互
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import { useStageSize } from '@/composables/useStageSize'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useCanvasEvents } from '@/composables/useCanvasEvents'
import { useCanvasNavigation } from '@/composables/useCanvasNavigation'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { VueKonvaRef } from 'vue-konva'
import type Konva from 'konva'
import {
  CANVAS_BACKGROUND_COLOR,
  CONNECTION_TEMP_STROKE_COLOR,
  CONNECTION_TEMP_DASH,
  CONNECTION_ARROW_SIZE,
  CONNECTION_STROKE_WIDTH,
  LINE_STYLE_DASH_MAP,
} from '@/constants'
import type { Connection } from '@/types'
import WhiteboardNode from './WhiteboardNode.vue'
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

// ── Stage 容器引用（用于 NodeTextEditor 坐标转换） ──
const stageContainerRef = ref<HTMLDivElement | null>(null)

/** Konva Stage 引用（用于获取底层 Konva 实例） */
const stageRef = ref<VueKonvaRef<Konva.Stage> | null>(null)

/** Shift 键是否按下 */
const isShiftHeld = ref(false)

/** 连线拖拽时鼠标位置（临时连线终点） */
const tempConnEnd = ref<{ x: number; y: number } | null>(null)

// ── 文本编辑状态 ──
/** 是否正在编辑（用于禁用快捷键） */
const isEditing = computed(() => active.board.editingNodeId !== null)

// ── 快捷键（编辑状态下禁用） ──
useKeyboardShortcuts(isEditing)

// ── 画布事件 ──
const canvasEvents = useCanvasEvents()

// ── 画布导航（平移 + 缩放） ──
const nav = useCanvasNavigation()

// ── Shift 键状态追踪（用于连线创建） ──
function handleWindowKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Shift' && !e.repeat) {
    isShiftHeld.value = true
  }
}

function handleWindowKeyUp(e: KeyboardEvent): void {
  if (e.key === 'Shift') {
    isShiftHeld.value = false
    // Shift 释放时取消连线创建
    if (active.board.connectingFrom !== null) {
      active.board.connectingFrom = null
      tempConnEnd.value = null
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeyDown)
  window.addEventListener('keyup', handleWindowKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeyDown)
  window.removeEventListener('keyup', handleWindowKeyUp)
})

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

// ── Stage 事件包装 ──

/**
 * 处理画布点击
 * 委托给 useCanvasEvents 以处理空白区域取消选中
 */
function handleStageClick(e: unknown): void {
  canvasEvents.handleStageClick(e as import('konva/lib/Node').KonvaEventObject<MouseEvent>)
}

/**
 * 处理画布双击
 * 在双击位置创建新节点
 */
function handleStageDblClick(e: unknown): void {
  canvasEvents.handleStageDblClick(e as import('konva/lib/Node').KonvaEventObject<MouseEvent>)
}

/**
 * 处理画布右键菜单
 * 阻止浏览器默认右键菜单
 */
function handleStageContextMenu(e: unknown): void {
  canvasEvents.handleStageContextMenu(e as import('konva/lib/Node').KonvaEventObject<MouseEvent>)
}

/**
 * 处理滚轮缩放（Ctrl + 滚轮）
 */
function handleStageWheel(e: unknown): void {
  nav.handleWheel(e as KonvaEventObject<WheelEvent>)
}

/**
 * 处理 Stage 拖拽平移中
 */
function handleStageDragMove(e: unknown): void {
  nav.handleDragMove(e as KonvaEventObject<DragEvent>)
}

/**
 * 处理 Stage 拖拽平移结束
 */
function handleStageDragEnd(e: unknown): void {
  nav.handleDragEnd(e as KonvaEventObject<DragEvent>)
}

// ── 连线创建交互 ──

/**
 * 从事件目标向上查找所属节点的 ID
 * 遍历父节点链，找到 name 属性匹配节点 ID 的 Group
 */
function findNodeIdFromTarget(target: Konva.Node): string | null {
  let current: Konva.Node | null = target
  while (current && current.nodeType !== 'Stage') {
    const nodeName: string = current.name()
    if (nodeName && active.board.nodesArray.some((n) => n.id === nodeName)) {
      return nodeName
    }
    current = current.getParent()
  }
  return null
}

/** Stage mousedown: Shift + 点击节点 → 开始连线创建 */
function handleConnectionMouseDown(e: KonvaEventObject<MouseEvent>): void {
  if (!isShiftHeld.value) return
  if (e.target === e.currentTarget) return // 点击空白区域，忽略

  const nodeId = findNodeIdFromTarget(e.target)
  if (!nodeId) return

  active.board.connectingFrom = nodeId
}

/** Stage mousemove: 连线拖拽中更新临时终点 */
function handleConnectionMouseMove(e: KonvaEventObject<MouseEvent>): void {
  if (active.board.connectingFrom === null) return

  const stage = stageRef.value?.getNode()
  if (!stage) return

  const pos = stage.getRelativePointerPosition()
  if (pos) {
    tempConnEnd.value = { x: pos.x, y: pos.y }
  }
}

/** Stage mouseup: 连线拖拽结束 → 创建连线或取消 */
function handleConnectionMouseUp(e: KonvaEventObject<MouseEvent>): void {
  if (active.board.connectingFrom === null) return

  const fromNodeId = active.board.connectingFrom
  active.board.connectingFrom = null
  const targetNodeId =
    e.target !== e.currentTarget ? findNodeIdFromTarget(e.target) : null

  if (targetNodeId && targetNodeId !== fromNodeId) {
    active.board.addConnection(fromNodeId, targetNodeId)
  }

  tempConnEnd.value = null
}

// ── 连线渲染配置 ──

/** 连线点击：选中或取消选中 */
function handleConnectionClick(e: KonvaEventObject<MouseEvent>): void {
  const connId = e.target.name()
  if (!connId) return

  if (active.board.selectedConnectionId === connId) {
    // 已选中 → 取消选中
    active.board.selectConnection(null)
  } else {
    // 未选中 → 选中
    active.board.selectConnection(connId)
  }
}

/** 获取单条连线的 Konva Line 配置（中心到中心，根据连线属性渲染样式） */
function getConnectionConfig(conn: Connection) {
  const fromNode = active.board.nodesArray.find((n) => n.id === conn.fromNodeId)
  const toNode = active.board.nodesArray.find((n) => n.id === conn.toNodeId)
  if (!fromNode || !toNode) return { visible: false }

  const dash = LINE_STYLE_DASH_MAP[conn.lineStyle]

  return {
    points: [
      fromNode.x + fromNode.width / 2,
      fromNode.y + fromNode.height / 2,
      toNode.x + toNode.width / 2,
      toNode.y + toNode.height / 2,
    ],
    stroke: conn.strokeColor,
    strokeWidth: conn.strokeWidth,
    name: conn.id,
    hitStrokeWidth: 10,
    dash: dash.length > 1 ? dash : undefined,
  }
}

/** 计算有向连线中点箭头的三角形顶点（尖朝向终点，尺寸随粗细缩放） */
function getMidArrowConfig(conn: Connection) {
  const fromNode = active.board.nodesArray.find((n) => n.id === conn.fromNodeId)
  const toNode = active.board.nodesArray.find((n) => n.id === conn.toNodeId)
  if (!fromNode || !toNode || !conn.directed) return { visible: false }

  const fx = fromNode.x + fromNode.width / 2
  const fy = fromNode.y + fromNode.height / 2
  const tx = toNode.x + toNode.width / 2
  const ty = toNode.y + toNode.height / 2

  const mx = (fx + tx) / 2
  const my = (fy + ty) / 2

  const dx = tx - fx
  const dy = ty - fy
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return { visible: false }

  const ndx = dx / len
  const ndy = dy / len
  const px = -ndy // 垂直方向 X
  const py = ndx  // 垂直方向 Y

  // 箭头大小根据粗细动态缩放：2px → 8, 每+1px → +2
  const size = Math.max(CONNECTION_ARROW_SIZE, CONNECTION_ARROW_SIZE + (conn.strokeWidth - 2) * 2)
  const halfW = size * 0.55

  return {
    points: [
      mx + ndx * size, my + ndy * size,
      mx - ndx * halfW + px * halfW, my - ndy * halfW + py * halfW,
      mx - ndx * halfW - px * halfW, my - ndy * halfW - py * halfW,
    ],
    closed: true,
    fill: conn.strokeColor,
    stroke: conn.strokeColor,
    strokeWidth: 1,
    listening: false,
    hitStrokeWidth: 0,
  }
}

/** 获取临时连线（拖拽中）的 Konva Line 配置 */
function getTempConnectionConfig() {
  if (active.board.connectingFrom === null || tempConnEnd.value === null) {
    return { visible: false }
  }

  const fromNode = active.board.nodesArray.find(
    (n) => n.id === active.board.connectingFrom,
  )
  if (!fromNode) return { visible: false }

  return {
    points: [
      fromNode.x + fromNode.width / 2,
      fromNode.y + fromNode.height / 2,
      tempConnEnd.value.x,
      tempConnEnd.value.y,
    ],
    stroke: CONNECTION_TEMP_STROKE_COLOR,
    strokeWidth: CONNECTION_STROKE_WIDTH,
    dash: CONNECTION_TEMP_DASH,
    listening: false,
    hitStrokeWidth: 0,
  }
}

// ── Stage 事件包装（与现有模式保持一致） ──

function handleStageMouseDown(e: unknown): void {
  handleConnectionMouseDown(e as KonvaEventObject<MouseEvent>)
}

function handleStageMouseMove(e: unknown): void {
  handleConnectionMouseMove(e as KonvaEventObject<MouseEvent>)
}

function handleStageMouseUp(e: unknown): void {
  handleConnectionMouseUp(e as KonvaEventObject<MouseEvent>)
}
</script>

<template>
  <div
    ref="stageContainerRef"
    class="canvas-wrapper"
    :class="{ 'pan-mode': active.board.isPanMode, 'shift-held': isShiftHeld }"
  >
    <!-- Konva Stage -->
    <v-stage
      ref="stageRef"
      :config="stageConfig"
      :x="active.board.stageX"
      :y="active.board.stageY"
      :scaleX="active.board.stageScale"
      :scaleY="active.board.stageScale"
      :draggable="active.board.isPanMode"
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

        <!-- 连线主体 + 中点箭头 -->
        <template v-for="conn in active.board.connectionsArray" :key="conn.id">
          <v-line
            :config="getConnectionConfig(conn)"
            @click="handleConnectionClick"
          />
          <v-line
            v-if="conn.directed"
            :config="getMidArrowConfig(conn)"
          />
        </template>

        <!-- 临时连线（拖拽创建中，虚线） -->
        <v-line
          v-if="active.board.connectingFrom !== null"
          :config="getTempConnectionConfig()"
        />

        <!-- 节点列表 -->
        <WhiteboardNode
          v-for="node in active.board.nodesArray"
          :key="node.id"
          :node-id="node.id"
          :is-selected="node.id === active.board.selectedNodeId"
          :is-pan-mode="active.board.isPanMode"
          :is-shift-held="isShiftHeld"
          @select="active.board.selectNode"
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
