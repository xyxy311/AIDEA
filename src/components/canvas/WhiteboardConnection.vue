<script setup lang="ts">
/**
 * WhiteboardConnection - 白板连线组件：渲染 fromNode→toNode 线段、1/4 与 3/4 处箭头、
 * 中点文字标签（切断连线）、选中态衬线高亮；单击选中、双击编辑文字。
 */
import { computed } from 'vue'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useNodeStore } from '@/stores/node'
import { useThemeStore } from '@/stores/theme'
import {
  LINE_STYLE_DASH_MAP,
  CONNECTION_ARROW_SIZE,
  CONNECTION_SELECTED_STROKE_WIDTH,
  CONNECTION_SELECTED_LINER_PADDING,
  CONNECTION_SELECTED_LINER_OPACITY,
  CONNECTION_LABEL_FONT_SIZE,
  CONNECTION_LABEL_LINE_HEIGHT,
  CONNECTION_LABEL_PADDING,
  CONNECTION_LABEL_RADIUS,
  DEFAULT_NODE_STYLE,
} from '@/constants'

// ── Props ──
const props = defineProps<{
  connectionId: string
  parentId: string
  isSelected: boolean
}>()

// ── Emits ──
const emit = defineEmits<{
  click: [connectionId: string, ctrlKey?: boolean]
  dblclick: [connectionId: string]
}>()

// ── Store ──
const nodeStore = useNodeStore()
const theme = useThemeStore()

// ── Computed: 连线数据与两端节点 ──
// 从父节点的连接数组中查找该连线；conn 先赋局部变量，避免回调内 TS 窄化失效
const connection = computed(() =>
  nodeStore.getConnections(props.parentId).find(c => c.id === props.connectionId)
)

const fromNode = computed(() => {
  const conn = connection.value
  if (!conn) return undefined
  return nodeStore.getNode(conn.fromNodeId)
})

const toNode = computed(() => {
  const conn = connection.value
  if (!conn) return undefined
  return nodeStore.getNode(conn.toNodeId)
})

// ── 连线端点与中点（供线段 / 箭头 / 标签复用） ──
const geometry = computed(() => {
  const conn = connection.value
  const from = fromNode.value
  const to = toNode.value
  if (!conn || !from || !to) return null
  const fx = from.x + from.width / 2
  const fy = from.y + from.height / 2
  const tx = to.x + to.width / 2
  const ty = to.y + to.height / 2
  return { fx, fy, tx, ty, mx: (fx + tx) / 2, my: (fy + ty) / 2 }
})

// ── 连线主体 Konva 配置 ──
// 始终用用户原色原粗细；选中态高亮由底层衬线承担，不替换本条线以免干扰原样式
const lineConfig = computed(() => {
  const conn = connection.value
  const g = geometry.value
  if (!conn || !g) return { visible: false }

  const dash = LINE_STYLE_DASH_MAP[conn.lineStyle]

  return {
    points: [g.fx, g.fy, g.tx, g.ty],
    stroke: conn.strokeColor,
    strokeWidth: conn.strokeWidth,
    name: conn.id,
    hitStrokeWidth: 10,
    dash: dash.length > 1 ? dash : undefined,
  }
})

// ── 选中态高亮衬线（始终渲染 + visible 切换） ──
/**
 * 选中时在原线下叠加加粗半透明主题色作为标识。必须始终渲染用 visible 切换而非 v-if，
 * 否则选中时新建节点会被加到 layer 末尾（最上层）覆盖原线；listening:false 使点击仍命中上层原线。
 */
const linerConfig = computed(() => {
  const conn = connection.value
  const g = geometry.value
  if (!conn || !g) return { visible: false }

  const dash = LINE_STYLE_DASH_MAP[conn.lineStyle]
  const linerWidth = Math.max(
    conn.strokeWidth + CONNECTION_SELECTED_LINER_PADDING,
    CONNECTION_SELECTED_STROKE_WIDTH,
  )

  return {
    visible: props.isSelected,
    points: [g.fx, g.fy, g.tx, g.ty],
    stroke: theme.scheme.canvas.connectionSelected,
    strokeWidth: linerWidth,
    opacity: CONNECTION_SELECTED_LINER_OPACITY,
    dash: dash.length > 1 ? dash : undefined,
    name: conn.id,
    listening: false,
    hitStrokeWidth: 0,
  }
})

// ── 箭头 Konva 配置（沿连线 1/4 与 3/4 处，避开中点文字） ──
/** 计算沿线方向比例 t（0=起点, 1=终点）处的三角形箭头配置 */
function arrowConfigAt(t: number) {
  const conn = connection.value
  const g = geometry.value
  if (!conn || !g || !conn.directed) return { visible: false }

  const { fx, fy, tx, ty } = g
  const dx = tx - fx
  const dy = ty - fy
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return { visible: false }

  const ndx = dx / len
  const ndy = dy / len
  const px = -ndy // 垂直方向 X
  const py = ndx // 垂直方向 Y

  // 箭头大小随粗细动态缩放
  const size = Math.max(
    CONNECTION_ARROW_SIZE,
    CONNECTION_ARROW_SIZE + (conn.strokeWidth - 2) * 2,
  )
  const halfW = size * 0.55

  // t 处基准点（沿连线方向）
  const bx = fx + dx * t
  const by = fy + dy * t

  return {
    points: [
      bx + ndx * size,
      by + ndy * size,
      bx - ndx * halfW + px * halfW,
      by - ndy * halfW + py * halfW,
      bx - ndx * halfW - px * halfW,
      by - ndy * halfW - py * halfW,
    ],
    closed: true,
    fill: conn.strokeColor,
    stroke: conn.strokeColor,
    strokeWidth: 1,
    listening: false,
    hitStrokeWidth: 0,
  }
}

const arrow1Config = computed(() => arrowConfigAt(0.5))

// ── 文字测量（canvas measureText，缓存 context） ──
let measureCtx: CanvasRenderingContext2D | null = null
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  measureCtx = canvas.getContext('2d')
  return measureCtx
}

// ── 中点文字标签配置 ──
/** 测量文字并计算标签矩形 / 文字定位（居中于连线中点）；conn.text 为空时不渲染 */
const labelConfig = computed(() => {
  const conn = connection.value
  const g = geometry.value
  if (!conn || !g || !conn.text) return null

  const fontSize = CONNECTION_LABEL_FONT_SIZE
  const ctx = getMeasureCtx()
  let textWidth: number
  if (ctx) {
    ctx.font = `${fontSize}px ${DEFAULT_NODE_STYLE.fontFamily}`
    textWidth = ctx.measureText(conn.text).width
  } else {
    // 测量不可用（SSR/测试环境）时按字符数估算
    textWidth = conn.text.length * fontSize
  }

  const padX = CONNECTION_LABEL_PADDING
  const padY = CONNECTION_LABEL_PADDING * 0.6
  const width = textWidth + padX * 2
  const height = fontSize * CONNECTION_LABEL_LINE_HEIGHT + padY * 2

  return {
    x: g.mx - width / 2,
    y: g.my - height,
    width,
    height,
    text: conn.text,
    fontSize,
  }
})

/** 标签背景矩形（用画布背景色"切断"连线，保证文字可读） */
const labelRectConfig = computed(() => {
  const lc = labelConfig.value
  if (!lc) return { visible: false }
  return {
    x: lc.x,
    y: lc.y,
    width: lc.width,
    height: lc.height,
  }
})

/** 标签文字（listening:false，点击穿透到下方 labelRect） */
const labelTextConfig = computed(() => {
  const lc = labelConfig.value
  if (!lc) return { visible: false }
  return {
    text: lc.text,
    x: lc.x,
    y: lc.y,
    width: lc.width,
    height: lc.height,
    align: 'center' as const,
    verticalAlign: 'middle' as const,
    fontSize: lc.fontSize,
    fontFamily: DEFAULT_NODE_STYLE.fontFamily,
    fill: theme.scheme.canvas.nodeTextColor,
    listening: false,
  }
})

// ── 事件处理 ──

/** 单击 → emit 给 Canvas 处理选中/取消（支持 Ctrl 多选；仅左键） */
function onClick(e: KonvaEventObject<MouseEvent>): void {
  const ctrl = e.evt.ctrlKey || e.evt.metaKey
  if (e.evt.button !== 0) return

  emit('click', props.connectionId, ctrl)
}

/** 双击 → emit 触发连线文字编辑（仅左键） */
function onDblClick(e: KonvaEventObject<MouseEvent>): void {
  if (e.evt.button !== 0) return
  emit('dblclick', props.connectionId)
}
</script>

<template>
  <!-- 选中态衬线：始终渲染（不得用 v-if），保证 z-order 恒在底层，点击仍命中上层原线 -->
  <v-line :config="linerConfig" />
  <!-- 上层原线：保留用户原色原粗细与事件监听 -->
  <v-line :config="lineConfig" @click="onClick" @dblclick="onDblClick" />
  <v-line v-if="connection?.directed" :config="arrow1Config" />
  <template v-if="labelConfig">
    <v-rect :config="labelRectConfig" @click="onClick" @dblclick="onDblClick" />
    <v-text :config="labelTextConfig" />
  </template>
</template>
