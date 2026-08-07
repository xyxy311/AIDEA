<script setup lang="ts">
/**
 * WhiteboardConnection - 白板连线组件
 *
 * 渲染单条节点之间的连线，包含：
 * - 从 fromNode 中心到 toNode 中心的线段
 * - 有向连线中点三角形箭头
 * - 连线中点文字标签（conn.text 非 null 时渲染，带背景"切断"连线）
 * - 选中态高亮
 *
 * 交互：
 * - 单击 -> 选中/取消选中连线（emit click -> Canvas 处理 toggle）
 * - 双击 -> 触发连线文字编辑（emit dblclick）
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
  /** 持有此连线的父节点 ID（视图关联节点） */
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

// ── Computed: 连线数据 ──
// 从父节点的连接数组中查找该连线
const connection = computed(() =>
  nodeStore.getConnections(props.parentId).find(c => c.id === props.connectionId)
)

// ── Computed: 两端节点 ──
// 注意：先将 connection.value 赋值给局部变量，避免回调内 TypeScript 窄化失效
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
// 始终使用用户原色原粗细；选中态高亮由底层衬线（linerConfig）承担，
// 不再用主题色替换本条线，避免干扰用户原样式。
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

// ── 选中态高亮衬线（方案 A · 高亮衬里） ──
/**
 * 选中时在用户原线下方叠加一层加粗、半透明的主题选中色衬线作为选中标识；
 * 未选中时通过 visible 隐藏。宽度 = 用户粗细 + 四周扩展增量，且不低于最小选中标识宽度。
 * 虚线样式与上层原线保持一致，保证虚实对齐、整体协调。
 * 注意：必须"始终渲染"本节点并用 visible 切换，而非 v-if 动态创建/销毁——
 * 否则选中时新创建的节点会被 Konva add 到 layer 末尾（最上层），高亮反而覆盖用户原线。
 * listening:false —— 点击仍命中上层原线（事件监听保留在用户可点击的原线上）。
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

// ── 箭头 Konva 配置（沿连线方向的 1/4 与 3/4 处各一个，避开中点文字） ──
/**
 * 计算沿线方向比例 t（0=起点, 1=终点）处的三角形箭头配置。
 * 两个箭头分别位于 1/4 与 3/4 处，中点留给文字标签，避免互相遮挡。
 */
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

  // 箭头大小根据粗细动态缩放
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
/**
 * 测量文字并计算标签矩形 / 文字定位（居中于连线中点）。
 * conn.text 为 null 时不渲染（返回 null）。
 */
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
    // 测量不可用时（如 SSR / 测试环境）按字符数估算
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

/** 标签背景矩形（用画布背景色"切断"连线，使文字可读） */
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

/** 单击 -> emit 给 Canvas 处理选中/取消选中（支持 Ctrl 多选） */
function onClick(e: KonvaEventObject<MouseEvent>): void {
  const ctrl = e.evt.ctrlKey || e.evt.metaKey
  // 仅响应左键
  if (e.evt.button !== 0) return

  emit('click', props.connectionId, ctrl)
}

/** 双击 -> emit 触发连线文字编辑（仅响应左键） */
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
