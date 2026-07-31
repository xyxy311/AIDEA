<script setup lang="ts">
/**
 * WhiteboardConnection - 白板连线组件
 *
 * 渲染单条节点之间的连线，包含：
 * - 从 fromNode 中心到 toNode 中心的线段
 * - 有向连线中点三角形箭头
 * - 选中态高亮
 *
 * 交互：
 * - 单击 → 选中/取消选中连线（emit click → Canvas 处理 toggle）
 */
import { computed } from 'vue'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useActiveView } from '@/composables/useActiveView'
import {
  LINE_STYLE_DASH_MAP,
  CONNECTION_ARROW_SIZE,
  CONNECTION_SELECTED_STROKE_COLOR,
  CONNECTION_SELECTED_STROKE_WIDTH,
} from '@/constants'

// ── Props ──
const props = defineProps<{
  connectionId: string
  isSelected: boolean
}>()

// ── Emits ──
const emit = defineEmits<{
  click: [connectionId: string, ctrlKey?: boolean]
}>()

// ── Store ──
const active = useActiveView()

// ── Computed: 连线数据 ──
// 从当前视图的连接数组中查找该连线
const connection = computed(() =>
  active.nodeStore.getConnections(active.project.activeViewId).find(c => c.id === props.connectionId)
)

// ── Computed: 两端节点 ──
// 注意：先将 connection.value 赋值给局部变量，避免回调内 TypeScript 窄化失效
const fromNode = computed(() => {
  const conn = connection.value
  if (!conn) return undefined
  return active.nodeStore.getNode(conn.fromNodeId)
})

const toNode = computed(() => {
  const conn = connection.value
  if (!conn) return undefined
  return active.nodeStore.getNode(conn.toNodeId)
})

// ── 连线主体 Konva 配置 ──
const lineConfig = computed(() => {
  const conn = connection.value
  const from = fromNode.value
  const to = toNode.value
  if (!conn || !from || !to) return { visible: false }

  const dash = LINE_STYLE_DASH_MAP[conn.lineStyle]

  return {
    points: [
      from.x + from.width / 2,
      from.y + from.height / 2,
      to.x + to.width / 2,
      to.y + to.height / 2,
    ],
    stroke: props.isSelected
      ? CONNECTION_SELECTED_STROKE_COLOR
      : conn.strokeColor,
    strokeWidth: props.isSelected
      ? CONNECTION_SELECTED_STROKE_WIDTH
      : conn.strokeWidth,
    name: conn.id,
    hitStrokeWidth: 10,
    dash: dash.length > 1 ? dash : undefined,
  }
})

// ── 中点箭头 Konva 配置 ──
const arrowConfig = computed(() => {
  const conn = connection.value
  const from = fromNode.value
  const to = toNode.value
  if (!conn || !from || !to || !conn.directed) return { visible: false }

  const fx = from.x + from.width / 2
  const fy = from.y + from.height / 2
  const tx = to.x + to.width / 2
  const ty = to.y + to.height / 2

  const mx = (fx + tx) / 2
  const my = (fy + ty) / 2

  const dx = tx - fx
  const dy = ty - fy
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return { visible: false }

  const ndx = dx / len
  const ndy = dy / len
  const px = -ndy // 垂直方向 X
  const py = ndx // 垂直方向 Y

  // 箭头大小根据粗细动态缩放
  const size = Math.max(
    CONNECTION_ARROW_SIZE,
    CONNECTION_ARROW_SIZE + (conn.strokeWidth - 2) * 2,
  )
  const halfW = size * 0.55

  return {
    points: [
      mx + ndx * size,
      my + ndy * size,
      mx - ndx * halfW + px * halfW,
      my - ndy * halfW + py * halfW,
      mx - ndx * halfW - px * halfW,
      my - ndy * halfW - py * halfW,
    ],
    closed: true,
    fill: conn.strokeColor,
    stroke: conn.strokeColor,
    strokeWidth: 1,
    listening: false,
    hitStrokeWidth: 0,
  }
})

// ── 事件处理 ──

/** 单击 → emit 给 Canvas 处理选中/取消选中（支持 Ctrl 多选） */
function onClick(e: KonvaEventObject<MouseEvent>): void {
  const ctrl = e.evt.ctrlKey || e.evt.metaKey
  // 仅响应左键
  if (e.evt.button !== 0) return
  
  emit('click', props.connectionId, ctrl)
}
</script>

<template>
  <v-line :config="lineConfig" @click="onClick" />
  <v-line v-if="connection?.directed" :config="arrowConfig" />
</template>
