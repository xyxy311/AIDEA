<script setup lang="ts">
/**
 * CanvasStage - 通用画布组件
 *
 * 核心集成组件，负责：
 * 1. 渲染 Konva Stage 和所有节点 / 连线
 * 2. 管理内联文本编辑器的生命周期（editingNodeId 状态）
 * 3. 连接所有 composables 到 Store
 * 4. 编排节点、连线与编辑器之间的交互
 *
 * 通用化设计：通过 props.viewId 绑定任意视图实例（主视图 'main' 或内联视图）。
 * 主视图 / 内联视图的差异由 props（allowExpand / showOverviewMap）控制，组件内部无特判。
 *
 * 数据源：nodeStore（全局节点树 + 连线）+ viewStore（props.viewId 对应视图的视口/选中/编辑）。
 * 当前视图渲染的是 view.viewedNodeId 节点的直接子节点与它们之间的连线。
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useViewStore } from '@/stores/view'
import { useNodeStore } from '@/stores/node'
import { useCommands } from '@/composables/useCommands'
import { useStageSize } from '@/composables/useStageSize'
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
  INLINE_VIEW_MIN_WIDTH,
  INLINE_VIEW_MIN_HEIGHT,
} from '@/constants'
import WhiteboardNode from './WhiteboardNode.vue'
import WhiteboardConnection from './WhiteboardConnection.vue'
import InlineViewFrame from './InlineViewFrame.vue'
import InlineViewCanvas from './InlineViewCanvas.vue'
import NodeTextEditor from './NodeTextEditor.vue'
import OverviewMap from './OverviewMap.vue'
import ContextMenu from './ContextMenu.vue'
import type { ContextMenuItem } from '@/composables/useContextMenu'

// ── Props ──
const props = defineProps<{
  /** 此画布绑定的视图 ID（'main' 为主视图，其他为内联视图） */
  viewId: string
  /** 是否允许"展开/收起"右键菜单（主视图 true，内联视图 false） */
  allowExpand?: boolean
  /** 是否显示右下角小地图（主视图 true，内联视图 false） */
  showOverviewMap?: boolean
  /** 画布宽度（内联视图用容器尺寸；不传则用窗口尺寸） */
  width?: number
  /** 画布高度（内联视图用容器尺寸；不传则用窗口尺寸） */
  height?: number
}>()

// ── Store ──
const view = useViewStore(props.viewId)
const nodeStore = useNodeStore()
const commands = useCommands()

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

// ── 当前视图数据（computed，保持响应式）──

/** 当前视图（viewedNodeId 节点）的直接子节点 */
const nodesArray = computed(() => nodeStore.childrenOf(view.viewedNodeId))

/** 当前视图的连线（viewedNodeId 节点的 connections） */
const connectionsArray = computed(() => nodeStore.getConnections(view.viewedNodeId))

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

/** 选中节点变化时：置顶选中节点 + 重新附着 Transformer（nextTick 确保子组件已渲染） */
watch(
  () => Array.from(view.selectedNodeIds),
  async () => {
    await nextTick()
    // 将选中节点移到节点层顶部，避免被其他节点遮挡
    for (const id of view.selectedNodeIds) {
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

    // 区分：内联视图节点（更新视图状态尺寸，不入 undo）vs 普通节点（commitNodeResize 入 undo）
    if (view.getInlineViewRect(nodeId)) {
      // 内联视图节点：缩放矩形 = 更新 inlineViews 尺寸（视图状态，不入 undo）
      const newWidth = Math.max(rect.width() * scaleX, INLINE_VIEW_MIN_WIDTH)
      const newHeight = Math.max(rect.height() * scaleY, INLINE_VIEW_MIN_HEIGHT)
      view.updateInlineViewSize(nodeId, newWidth, newHeight)
      // 重置 rect 的 scale 与偏移（位置不变，始终跟随 node.x/y）
      rect.x(0)
      rect.y(0)
      rect.scaleX(1)
      rect.scaleY(1)
    } else {
      // 普通节点：将 scale 烘焙为 width/height，写入 store 并入 undo 栈
      const newWidth = Math.max(rect.width() * scaleX, MIN_NODE_WIDTH)
      const newHeight = Math.max(rect.height() * scaleY, MIN_NODE_HEIGHT)

      const node = nodeStore.getNode(nodeId)
      // 捕获 resize 前的旧状态（用于 undo）
      const oldState = {
        x: node?.x ?? 0,
        y: node?.y ?? 0,
        width: node?.width ?? 0,
        height: node?.height ?? 0,
      }

      const worldX = (node?.x ?? 0) + rect.x()
      const worldY = (node?.y ?? 0) + rect.y()

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
            width: stageWidth,
            height: stageHeight,
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
          :parent-id="view.viewedNodeId"
          :is-selected="view.selectedConnectionIds.has(connItem.id)"
          @click="handleConnectionClick"
        />

        <!-- 临时连线（拖拽创建中，虚线） -->
        <v-line
          v-if="view.connectingFrom !== null"
          :config="conn.tempConnConfig.value"
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
            :is-selected="view.selectedNodeIds.has(node.id)"
            @dblclick="startTextEdit"
          />
          <WhiteboardNode
            v-else
            :ref="(el: unknown) => setNodeRef(node.id, el)"
            :node-id="node.id"
            :is-selected="view.selectedNodeIds.has(node.id)"
            @dblclick="startTextEdit"
          />
        </template>

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
