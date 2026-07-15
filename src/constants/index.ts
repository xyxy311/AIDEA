import type { NodeStyle } from '@/types'

// ── 节点默认尺寸 ──
export const DEFAULT_NODE_WIDTH: number = 200
export const DEFAULT_NODE_HEIGHT: number = 120
export const MIN_NODE_WIDTH: number = 150
export const MIN_NODE_HEIGHT: number = 80

// ── 节点内边距 ──
export const NODE_PADDING: number = 16

// ── 节点圆角 ──
export const NODE_BORDER_RADIUS: number = 8

// ── 工具栏高度 ──
export const TOOLBAR_HEIGHT: number = 56

// ── 节点默认样式（实现 NodeStyle 接口） ──
export const DEFAULT_NODE_STYLE: NodeStyle = {
  backgroundColor: '#ffffff',
  borderColor: '#d1d5db',
  borderWidth: 2,
  borderRadius: NODE_BORDER_RADIUS,
  fontSize: 16,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  textColor: '#1f2937',
  shadowEnabled: true,
  shadowColor: 'rgba(0, 0, 0, 0.08)',
  shadowBlur: 8,
  shadowOffsetX: 0,
  shadowOffsetY: 2,
}

// ── Transformer 配置 ──
export const TRANSFORMER_ANCHOR_SIZE: number = 8
export const TRANSFORMER_ANCHOR_CORNER_RADIUS: number = 2
export const TRANSFORMER_BORDER_STROKE: string = '#3b82f6'
export const TRANSFORMER_BORDER_DASH: [number, number] = [4, 4]

// ── 占位文本 ──
export const PLACEHOLDER_TEXT: string = '双击编辑'
export const PLACEHOLDER_TEXT_COLOR: string = '#9ca3af'

// ── 画布缩放 ──
export const MIN_SCALE: number = 0.1
export const MAX_SCALE: number = 5
export const ZOOM_STEP: number = 1.1

// ── 画布默认背景 ──
export const CANVAS_BACKGROUND_COLOR: string = '#f3f4f6'

// ── 默认节点文本 ──
export const DEFAULT_NODE_TEXT: string = '新节点'
