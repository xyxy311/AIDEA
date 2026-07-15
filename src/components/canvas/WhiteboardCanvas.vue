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
import { ref, computed } from 'vue'
import { useWhiteboardStore } from '@/stores/whiteboard'
import { useStageSize } from '@/composables/useStageSize'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useCanvasEvents } from '@/composables/useCanvasEvents'
import { useCanvasNavigation } from '@/composables/useCanvasNavigation'
import type { KonvaEventObject } from 'konva/lib/Node'
import { CANVAS_BACKGROUND_COLOR } from '@/constants'
import WhiteboardNode from './WhiteboardNode.vue'
import NodeTextEditor from './NodeTextEditor.vue'
import OverviewMap from './OverviewMap.vue'

// ── Store ──
const store = useWhiteboardStore()

// ── Stage 尺寸 ──
const { stageWidth, stageHeight } = useStageSize()

/** Konva Stage 配置 */
const stageConfig = computed(() => ({
  width: stageWidth.value,
  height: stageHeight.value,
  x: store.stageX,
  y: store.stageY,
  scaleX: store.stageScale,
  scaleY: store.stageScale,
  draggable: store.isPanMode,
}))

// ── Stage 容器引用（用于 NodeTextEditor 坐标转换） ──
const stageContainerRef = ref<HTMLDivElement | null>(null)

// ── 文本编辑状态 ──
/** 是否正在编辑（用于禁用快捷键） */
const isEditing = computed(() => store.editingNodeId !== null)

// ── 快捷键（编辑状态下禁用） ──
useKeyboardShortcuts(isEditing)

// ── 画布事件 ──
const canvasEvents = useCanvasEvents()

// ── 画布导航（平移 + 缩放） ──
const nav = useCanvasNavigation()

// ── 编辑中的节点数据（传递给 NodeTextEditor） ──
const editingNode = computed(() => {
  if (!store.editingNodeId) return null
  return store.nodesArray.find((n) => n.id === store.editingNodeId) ?? null
})

// ── 编辑操作方法 ──

/** 开始编辑指定节点（用于双击已有节点） */
function startTextEdit(nodeId: string): void {
  store.startEditing(nodeId)
}

/** 完成文本编辑（保存）—— store.setNodeText 内部已清除编辑状态 */
function finishTextEdit(nodeId: string, text: string): void {
  store.setNodeText(nodeId, text)
}

/** 取消文本编辑 */
function cancelTextEdit(): void {
  store.stopEditing()
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
</script>

<template>
  <div
    ref="stageContainerRef"
    class="canvas-wrapper"
    :class="{ 'pan-mode': store.isPanMode }"
  >
    <!-- Konva Stage -->
    <v-stage
      :config="stageConfig"
      @click="handleStageClick"
      @dblclick="handleStageDblClick"
      @contextmenu="handleStageContextMenu"
      @wheel="handleStageWheel"
      @dragmove="handleStageDragMove"
      @dragend="handleStageDragEnd"
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

        <!-- 节点列表 -->
        <WhiteboardNode
          v-for="node in store.nodesArray"
          :key="node.id"
          :node-id="node.id"
          :is-selected="node.id === store.selectedNodeId"
          :is-pan-mode="store.isPanMode"
          @select="store.selectNode"
          @dblclick="startTextEdit"
        />
      </v-layer>
    </v-stage>

    <!-- 文本编辑器覆盖层 -->
    <NodeTextEditor
      v-if="store.editingNodeId && editingNode"
      :key="store.editingNodeId"
      :node-id="store.editingNodeId"
      :initial-text="editingNode.text"
      :node-x="editingNode.x"
      :node-y="editingNode.y"
      :node-width="editingNode.width"
      :node-height="editingNode.height"
      :stage-scale="store.stageScale"
      :stage-x="store.stageX"
      :stage-y="store.stageY"
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
  flex: 1;
  position: relative;
  overflow: hidden;
}

.canvas-wrapper.pan-mode {
  cursor: grab;
}

.canvas-wrapper.pan-mode:active {
  cursor: grabbing;
}
</style>
