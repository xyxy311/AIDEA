<script setup lang="ts">
/**
 * WhiteboardNode - 白板节点组件
 *
 * 单个可拖拽、选中、调整大小的白板节点。
 * 使用 vue-konva 的 v-group + v-rect + v-text + v-transformer 组合渲染。
 *
 * 交互：
 * - 单击 → 选中节点（emit select）
 * - 拖拽 → 移动节点（dragend 时同步位置到 store）
 * - 双击 → 开始文本编辑（emit dblclick）
 * - Transformer → 调整大小（transformend 时同步尺寸到 store）
 */
import { ref, computed } from 'vue'
import type { VueKonvaRef } from 'vue-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import {
  DEFAULT_NODE_STYLE,
  NODE_PADDING,
  NODE_LINE_HEIGHT,
  PLACEHOLDER_TEXT,
  PLACEHOLDER_TEXT_COLOR,
} from '@/constants'

// ── Props ──
const props = defineProps<{
  nodeId: string
  isSelected: boolean
  draggable: boolean
}>()

// ── Emits ──
const emit = defineEmits<{
  select: [nodeId: string, ctrlKey?: boolean]
  dblclick: [nodeId: string]
}>()

// ── Store ──
const active = useActiveWhiteboard()

// ── Refs ──
const rectRef = ref<VueKonvaRef<Konva.Rect> | null>(null)

// ── Computed: 从 reactive Map 直接获取节点代理 ──
// reactive Map 的 get 返回 reactive 代理，属性变化自动触发下游 computed
const node = computed(() => active.board.nodes.get(props.nodeId))

// ── Konva 节点配置 ──

/** 节点组的拖拽配置 */
const groupConfig = {
  name: props.nodeId,
}

/** 节点背景矩形配置 */
const rectConfig = computed(() => {
  const n = node.value
  if (!n) return {}
  return {
    width: n.width,
    height: n.height,
    // 优先使用节点自定义样式，未设置则回退到全局默认
    fill: n.backgroundColor ?? DEFAULT_NODE_STYLE.backgroundColor,
    stroke: n.borderColor ?? DEFAULT_NODE_STYLE.borderColor,
    strokeWidth: DEFAULT_NODE_STYLE.borderWidth,
    cornerRadius: DEFAULT_NODE_STYLE.borderRadius,
    shadowColor: DEFAULT_NODE_STYLE.shadowEnabled
      ? DEFAULT_NODE_STYLE.shadowColor
      : undefined,
    shadowBlur: DEFAULT_NODE_STYLE.shadowEnabled
      ? DEFAULT_NODE_STYLE.shadowBlur
      : 0,
    shadowOffsetX: DEFAULT_NODE_STYLE.shadowEnabled
      ? DEFAULT_NODE_STYLE.shadowOffsetX
      : 0,
    shadowOffsetY: DEFAULT_NODE_STYLE.shadowEnabled
      ? DEFAULT_NODE_STYLE.shadowOffsetY
      : 0,
  }
})

/** 节点文本配置 */
const textConfig = computed(() => {
  const n = node.value
  if (!n) return {}
  const displayText: string = n.text || PLACEHOLDER_TEXT
  const isPlaceholder: boolean = !n.text

  return {
    text: displayText,
    width: n.width,
    height: n.height,
    align: 'center' as const,
    verticalAlign: 'middle' as const,
    fontSize: DEFAULT_NODE_STYLE.fontSize,
    fontFamily: DEFAULT_NODE_STYLE.fontFamily,
    lineHeight: NODE_LINE_HEIGHT,
    // 按字符换行，确保中文也能正确断行
    wrap: 'char' as const,
    // 节点自定义字体颜色 > 全局默认；占位符用灰色
    fill: n.textColor
      ? n.textColor
      : isPlaceholder
        ? PLACEHOLDER_TEXT_COLOR
        : DEFAULT_NODE_STYLE.textColor,
    padding: NODE_PADDING,
  }
})



// ── 事件处理 ──

/** 单击选中（支持 Ctrl 多选） */
function onClick(e: KonvaEventObject<MouseEvent>): void {
  const ctrl = e.evt.ctrlKey || e.evt.metaKey
  emit('select', props.nodeId, ctrl)
}

/** 双击开始编辑 */
function onDblClick(): void {
  emit('dblclick', props.nodeId)
}

/** 拖拽开始时所有选中节点的初始位置快照（用于多选同步移动） */
let dragStartPositions: Map<string, { x: number; y: number }> = new Map()
/** 被拖拽节点在 dragstart 时的位置（用于计算 delta） */
let draggedStartPos: { x: number; y: number } = { x: 0, y: 0 }

/** 拖拽开始：自动选中（支持 Ctrl 多选），记录多选位置快照 */
function onDragStart(e: KonvaEventObject<DragEvent>): void {
  const board = active.board
  // 记录被拖节点起始位置（固定为起点，用于计算总 delta，不在 move 中更新）
  draggedStartPos = { x: e.target.x(), y: e.target.y() }

  if (board.selectedNodeIds.has(props.nodeId)) {
    // 已在选中集：记录所有选中节点初始位置，保持多选状态
    dragStartPositions.clear()
    board.selectedNodeIds.forEach((id) => {
      const n = board.nodes.get(id)
      if (n) dragStartPositions.set(id, { x: n.x, y: n.y })
    })
    return
  }
  // 未选中，触发单选（拖拽时不应多选追加，用户体验更好）
  emit('select', props.nodeId, false)
  // 单选情况下记录自身位置（统一逻辑）
  dragStartPositions.clear()
  dragStartPositions.set(props.nodeId, { x: e.target.x(), y: e.target.y() })
}

/** 拖拽中：同步被拖节点 + 其他选中节点跟随总 delta */
function onDragMove(e: KonvaEventObject<DragEvent>): void {
  const board = active.board
  // 总 delta：当前位置相对拖拽起点的偏移（draggedStartPos 固定为起点，不更新）
  const deltaX = e.target.x() - draggedStartPos.x
  const deltaY = e.target.y() - draggedStartPos.y

  // 同步被拖节点位置（使连线端点实时跟随）
  board.moveNode(props.nodeId, e.target.x(), e.target.y())

  // 同步其他选中节点：从各自初始位置叠加总 delta
  dragStartPositions.forEach((start, id) => {
    if (id === props.nodeId) return
    board.moveNode(id, start.x + deltaX, start.y + deltaY)
  })
}

/** 拖拽结束：最终同步 + 清空快照 */
function onDragEnd(e: KonvaEventObject<DragEvent>): void {
  const board = active.board
  const deltaX = e.target.x() - draggedStartPos.x
  const deltaY = e.target.y() - draggedStartPos.y

  board.moveNode(props.nodeId, e.target.x(), e.target.y())
  dragStartPositions.forEach((start, id) => {
    if (id === props.nodeId) return
    board.moveNode(id, start.x + deltaX, start.y + deltaY)
  })

  dragStartPositions.clear()
}

defineExpose({
  /** 返回底层 Konva.Rect 实例，供父组件全局 Transformer 附着 */
  getRectNode: () => rectRef.value?.getNode() ?? null,
})
</script>

<template>
  <v-group
    :config="groupConfig"
    :draggable="props.draggable"
    :x="node?.x"
    :y="node?.y"
    @click="onClick"
    @dblclick="onDblClick"
    @dragstart="onDragStart"
    @dragmove="onDragMove"
    @dragend="onDragEnd"
  >
    <v-rect ref="rectRef" :config="rectConfig" />
    <v-text :config="textConfig" />
  </v-group>
</template>
