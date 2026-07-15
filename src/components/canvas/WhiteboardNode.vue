<script setup lang="ts">
/**
 * WhiteboardNode - 白板节点组件
 *
 * 单个可拖拽、选中的白板节点。
 * 使用 vue-konva 的 v-group + v-rect + v-text + v-transformer 组合渲染。
 *
 * 交互：
 * - 单击 → 选中节点（emit select）
 * - 拖拽 → 移动节点（dragend 时同步位置到 store）
 * - 双击 → 开始文本编辑（emit dblclick）
 * - Transformer → 调整大小（transformend 时同步尺寸到 store）
 */
import { ref, computed, watch, nextTick } from 'vue'
import type { VueKonvaRef } from 'vue-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import { useWhiteboardStore } from '@/stores/whiteboard'
import {
  DEFAULT_NODE_STYLE,
  SELECTED_BORDER_COLOR,
  SELECTED_BORDER_WIDTH,
  // MIN_NODE_WIDTH,
  // MIN_NODE_HEIGHT,
  PLACEHOLDER_TEXT,
  PLACEHOLDER_TEXT_COLOR,
  // TRANSFORMER_ANCHOR_SIZE,
  // TRANSFORMER_BORDER_STROKE,
  // TRANSFORMER_BORDER_DASH,
} from '@/constants'

// ── Props ──
const props = defineProps<{
  nodeId: string
  isSelected: boolean
  isPanMode: boolean
}>()

// ── Emits ──
const emit = defineEmits<{
  select: [nodeId: string]
  dblclick: [nodeId: string]
}>()

// ── Store ──
const store = useWhiteboardStore()

// ── Refs ──
const rectRef = ref<VueKonvaRef<Konva.Rect> | null>(null)
const transformerRef = ref<VueKonvaRef<Konva.Transformer> | null>(null)

// ── Computed: 从 store 获取最新节点数据 ──
// 注意：必须返回新对象引用以触发下游 computed 重新计算
// shallowRef<Map> 配合 triggerRef 时，Map 中对象引用不变，
// Vue computed 默认按 === 比较，同引用会被视为"未变化"从而跳过通知
const node = computed(() => {
  const found = store.nodesArray.find((n) => n.id === props.nodeId)
  if (!found) return undefined
  return { ...found }
})

// ── Konva 节点配置 ──

/** 节点组的拖拽配置 */
const groupConfig = computed(() => {
  const n = node.value
  if (!n) return {}
  return {
    x: n.x,
    y: n.y,
    draggable: !props.isPanMode,
  }
})

/** 节点背景矩形配置 */
const rectConfig = computed(() => {
  const n = node.value
  if (!n) return {}
  return {
    width: n.width,
    height: n.height,
    fill: DEFAULT_NODE_STYLE.backgroundColor,
    stroke: props.isSelected
      ? SELECTED_BORDER_COLOR
      : DEFAULT_NODE_STYLE.borderColor,
    strokeWidth: props.isSelected
      ? SELECTED_BORDER_WIDTH
      : DEFAULT_NODE_STYLE.borderWidth,
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
    fill: isPlaceholder ? PLACEHOLDER_TEXT_COLOR : DEFAULT_NODE_STYLE.textColor,
    padding: 12,
  }
})

/** Transformer 配置 */
// 暂时不使用变换
// const transformerConfig = {
//   anchorSize: TRANSFORMER_ANCHOR_SIZE,
//   borderStroke: TRANSFORMER_BORDER_STROKE,
//   borderDash: TRANSFORMER_BORDER_DASH,
//   enabledAnchors: [
//     'top-left',
//     'top-right',
//     'bottom-left',
//     'bottom-right',
//   ] as const,
//   /** 视觉最小尺寸约束：小于最小尺寸时回退到旧尺寸 */
//   boundBoxFunc: (
//     oldBox: { width: number; height: number },
//     newBox: { width: number; height: number },
//   ) => {
//     if (newBox.width < MIN_NODE_WIDTH || newBox.height < MIN_NODE_HEIGHT) {
//       return oldBox
//     }
//     return newBox
//   },
// }

// // ── 选中状态变化时重新绑定 Transformer ──
// watch(
//   () => props.isSelected,
//   async (selected) => {
//     if (selected) {
//       await nextTick()
//       const rect = rectRef.value?.getNode()
//       const transformer = transformerRef.value?.getNode()
//       if (transformer && rect) {
//         transformer.nodes([rect])
//         transformer.getLayer()?.batchDraw()
//       }
//     }
//   },
// )

// ── 事件处理 ──

/** 单击选中 */
function onClick(): void {
  emit('select', props.nodeId)
}

/** 双击开始编辑 */
function onDblClick(): void {
  emit('dblclick', props.nodeId)
}

/** 拖拽开始：自动选中 */
function onDragStart(): void {
  emit('select', props.nodeId)
}

/** 拖拽结束：同步最终位置到 store */
function onDragEnd(e: KonvaEventObject<DragEvent>): void {
  const newX: number = e.target.x()
  const newY: number = e.target.y()
  store.moveNode(props.nodeId, newX, newY)
}

/** 变换结束：同步最终尺寸到 store */
// 暂时不使用变换
// function onTransformEnd(e: KonvaEventObject<Event>): void {
//   const target: Konva.Rect = e.target as Konva.Rect
//   const scaleX: number = target.scaleX()
//   const scaleY: number = target.scaleY()

//   // 重置 scale 并将变换应用到 width/height
//   target.scaleX(1)
//   target.scaleY(1)

//   const newX: number = target.x()
//   const newY: number = target.y()
//   const newWidth: number = Math.max(target.width() * scaleX, MIN_NODE_WIDTH)
//   const newHeight: number = Math.max(target.height() * scaleY, MIN_NODE_HEIGHT)

//   store.resizeNode(props.nodeId, newX, newY, newWidth, newHeight)
// }
</script>

<template>
  <v-group
    :config="groupConfig"
    @click="onClick"
    @dblclick="onDblClick"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
  >
    <v-rect ref="rectRef" :config="rectConfig" />
    <v-text :config="textConfig" />
    <!-- <v-transformer
      v-if="isSelected"
      ref="transformerRef"
      :config="transformerConfig"
      @transformend="onTransformEnd"
    /> -->
  </v-group>
</template>
