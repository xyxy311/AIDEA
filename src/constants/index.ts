import type { NodeStyle, LineStyle, NodePresetStyle, ConnectionPresetStyle } from '@/types'

// ── 节点默认尺寸 ──
export const DEFAULT_NODE_WIDTH: number = 200
export const DEFAULT_NODE_HEIGHT: number = 120

/** Transformer 可调整的最小宽高（px，缩放为 1 时）。无上限。 */
export const MIN_NODE_WIDTH: number = 20
export const MIN_NODE_HEIGHT: number = 20

// ── 节点内边距 ──
export const NODE_PADDING: number = 16

// ── 文本行高倍率 ──
export const NODE_LINE_HEIGHT: number = 1.5

// ── 节点圆角 ──
export const NODE_BORDER_RADIUS: number = 8

// ── 工具栏高度 ──
export const TOOLBAR_HEIGHT: number = 56

// ── 菜单栏高度 ──
export const MENU_BAR_HEIGHT: number = 28

// ── 节点默认样式（实现 NodeStyle 接口） ──
export const DEFAULT_NODE_STYLE: NodeStyle = {
  backgroundColor: '#ffffff',
  borderColor: '#d1d5db',
  borderWidth: 2,
  borderRadius: NODE_BORDER_RADIUS,
  fontSize: 16,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  textColor: '#1f2937',
  shadowEnabled: false,
  shadowColor: 'rgba(0, 0, 0, 0.08)',
  shadowBlur: 8,
  shadowOffsetX: 0,
  shadowOffsetY: 2,
}

// ── 预设节点样式 ──
export interface PresetStyle {
  name: string
  backgroundColor: string
  borderColor: string
  textColor: string
}

export const PRESET_STYLES: PresetStyle[] = [
  { name: '默认', backgroundColor: '#ffffff', borderColor: '#d1d5db', textColor: '#1f2937' },
  { name: '蓝色', backgroundColor: '#eff6ff', borderColor: '#3b82f6', textColor: '#1e40af' },
  { name: '绿色', backgroundColor: '#f0fdf4', borderColor: '#22c55e', textColor: '#166534' },
  { name: '黄色', backgroundColor: '#fefce8', borderColor: '#eab308', textColor: '#854d0e' },
  { name: '红色', backgroundColor: '#fef2f2', borderColor: '#ef4444', textColor: '#991b1b' },
  { name: '紫色', backgroundColor: '#faf5ff', borderColor: '#a855f7', textColor: '#6b21a8' },
  { name: '灰色', backgroundColor: '#f9fafb', borderColor: '#6b7280', textColor: '#374151' },
  { name: '粉色', backgroundColor: '#fdf2f8', borderColor: '#ec4899', textColor: '#9d174d' },
]

// ── Transformer 配置 ──
export const TRANSFORMER_ANCHOR_SIZE: number = 8
export const TRANSFORMER_ANCHOR_CORNER_RADIUS: number = 2
export const TRANSFORMER_BORDER_STROKE: string = '#3b82f6'
export const TRANSFORMER_BORDER_DASH: [number, number] = [4, 4]

// ── 框选（Marquee Selection）──

/** 框选矩形填充色（半透明蓝） */
export const MARQUEE_FILL_COLOR: string = 'rgba(59, 130, 246, 0.15)'

/** 框选矩形描边色 */
export const MARQUEE_STROKE_COLOR: string = '#3b82f6'

/** 框选矩形虚线样式 */
export const MARQUEE_STROKE_DASH: number[] = [4, 4]

/** 框选矩形描边宽度 */
export const MARQUEE_STROKE_WIDTH: number = 1

/** 框选激活阈值（世界坐标 px）：鼠标按下后移动超过此距离才开始框选，避免与单击取消选中冲突 */
export const MARQUEE_ACTIVATE_THRESHOLD: number = 5

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

// ── 连线样式 ──

/** 连线默认线型 */
export const DEFAULT_LINE_STYLE: LineStyle = 'solid'

/** 连线默认描边颜色 */
export const CONNECTION_STROKE_COLOR = '#6b7280'

/** 连线默认描边宽度 */
export const CONNECTION_STROKE_WIDTH = 2

/** 连线默认是否有箭头 */
export const DEFAULT_CONNECTION_DIRECTED = true

/** 连线最大描边宽度 */
export const CONNECTION_MAX_STROKE_WIDTH = 10

/** 线型选项（用于 UI 下拉） */
export const LINE_STYLE_OPTIONS: { label: string; value: LineStyle }[] = [
  { label: '实线', value: 'solid' },
  { label: '虚线', value: 'dashed' },
  { label: '点线', value: 'dotted' },
]

/** 线型 → Konva dash 数组映射 */
export const LINE_STYLE_DASH_MAP: Record<LineStyle, number[]> = {
  solid: [],
  dashed: [10, 6],
  dotted: [4, 4],
}

/** 临时连线（拖拽中）的描边颜色 */
export const CONNECTION_TEMP_STROKE_COLOR = '#3b82f6'

/** 临时连线的虚线段样式 */
export const CONNECTION_TEMP_DASH = [6, 4]

/** 连线箭头大小 */
export const CONNECTION_ARROW_SIZE = 8

/** 选中连线的描边颜色 */
export const CONNECTION_SELECTED_STROKE_COLOR = '#3b82f6'

/** 选中连线的描边宽度 */
export const CONNECTION_SELECTED_STROKE_WIDTH = 3

// ── 预设样式系统 ──

/** 默认节点预设（不含 id，由 store 初始化时分配 id） */
export const DEFAULT_NODE_PRESETS: Omit<NodePresetStyle, 'id' | 'type'>[] = [
  { name: '默认', backgroundColor: '#ffffff', borderColor: '#d1d5db', textColor: '#1f2937' },
  { name: '蓝色', backgroundColor: '#eff6ff', borderColor: '#3b82f6', textColor: '#1e40af' },
  { name: '绿色', backgroundColor: '#f0fdf4', borderColor: '#22c55e', textColor: '#166534' },
  { name: '黄色', backgroundColor: '#fefce8', borderColor: '#eab308', textColor: '#854d0e' },
  { name: '红色', backgroundColor: '#fef2f2', borderColor: '#ef4444', textColor: '#991b1b' },
  { name: '紫色', backgroundColor: '#faf5ff', borderColor: '#a855f7', textColor: '#6b21a8' },
  { name: '灰色', backgroundColor: '#f9fafb', borderColor: '#6b7280', textColor: '#374151' },
  { name: '粉色', backgroundColor: '#fdf2f8', borderColor: '#ec4899', textColor: '#9d174d' },
]

/** 默认连线预设（不含 id，由 store 初始化时分配 id） */
export const DEFAULT_CONNECTION_PRESETS: Omit<ConnectionPresetStyle, 'id' | 'type'>[] = [
  { name: '默认灰线', lineStyle: 'solid', strokeWidth: 2, strokeColor: '#6b7280', directed: true },
  { name: '蓝色箭头', lineStyle: 'solid', strokeWidth: 3, strokeColor: '#3b82f6', directed: true },
  { name: '红色虚线', lineStyle: 'dashed', strokeWidth: 2, strokeColor: '#ef4444', directed: true },
  { name: '绿色无箭头', lineStyle: 'solid', strokeWidth: 4, strokeColor: '#22c55e', directed: false },
  { name: '灰色点线', lineStyle: 'dotted', strokeWidth: 1, strokeColor: '#9ca3af', directed: false },
]
