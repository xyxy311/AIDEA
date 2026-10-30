// 画布与数据层设计 token：节点尺寸/内边距/网格、占位与缩放、连线样式、预设样式、内联视图与标签胶囊尺寸。
import type { NodeStyle, LineStyle, NodePresetStyle, ConnectionPresetStyle } from '@/types'

// ── 节点默认尺寸 ──
export const DEFAULT_NODE_WIDTH: number = 200
export const DEFAULT_NODE_HEIGHT: number = 100

// ── 网格间距（世界坐标 px）──
/** 网格模式下节点坐标与尺寸的最小单位 */
export const GRID_G: number = 100

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
  borderColor: '#d1d5db',
  borderWidth: 2,
  borderRadius: NODE_BORDER_RADIUS,
  fontSize: 16,
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

// ── 预设节点样式 ──
export interface PresetStyle {
  name: string
  borderColor: string
}

// ── Transformer 配置 ──
export const TRANSFORMER_ANCHOR_SIZE: number = 8
export const TRANSFORMER_ANCHOR_CORNER_RADIUS: number = 2
export const TRANSFORMER_BORDER_DASH: [number, number] = [4, 4]

// ── 框选（Marquee Selection）──

/** 框选矩形虚线样式 */
export const MARQUEE_STROKE_DASH: number[] = [4, 4]

/** 框选矩形描边宽度 */
export const MARQUEE_STROKE_WIDTH: number = 1

/** 框选激活阈值（世界坐标 px）：鼠标按下后移动超过此距离才开始框选，避免与单击取消选中冲突 */
export const MARQUEE_ACTIVATE_THRESHOLD: number = 5

/** 节点拖动激活阈值（像素，世界坐标），低于此距离视为点击而非拖动 */
export const NODE_DRAG_THRESHOLD: number = 5

// ── 占位文本 ──
/** 节点空文本占位文案的 i18n key（消费处经 t() 翻译，禁止直接落中文常量） */
export const PLACEHOLDER_TEXT_KEY: string = 'canvas.placeholderEdit'
export const PLACEHOLDER_TEXT_COLOR: string = '#9ca3af'

// ── 画布缩放 ──
export const MIN_SCALE: number = 0.1
export const MAX_SCALE: number = 5
export const ZOOM_STEP: number = 1.1

// ── 默认节点文本 ──
export const DEFAULT_NODE_TEXT: string = 'New Node'

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

/**
 * 线型下拉选项，labelKey 经 t() 翻译，不落中文文案。
 */
export const LINE_STYLE_OPTIONS: { labelKey: string; value: LineStyle }[] = [
  { labelKey: 'connection.lineStyleSolid', value: 'solid' },
  { labelKey: 'connection.lineStyleDashed', value: 'dashed' },
  { labelKey: 'connection.lineStyleDotted', value: 'dotted' },
]

/** 线型 → Konva dash 数组映射 */
export const LINE_STYLE_DASH_MAP: Record<LineStyle, number[]> = {
  solid: [],
  dashed: [10, 6],
  dotted: [4, 4],
}

/** 临时连线的虚线段样式 */
export const CONNECTION_TEMP_DASH = [6, 4]

/** 连线箭头大小 */
export const CONNECTION_ARROW_SIZE = 8

/** 选中连线的描边宽度（现作为选中衬线的最小宽度，保证细线也有清晰选中标识） */
export const CONNECTION_SELECTED_STROKE_WIDTH = 3

/** 选中态衬线在用户原粗细基础上四周扩展的宽度增量（px） */
export const CONNECTION_SELECTED_LINER_PADDING: number = 4

/** 选中态衬线透明度（半透明，突出选中标识但不遮蔽用户原色） */
export const CONNECTION_SELECTED_LINER_OPACITY: number = 0.6

/** 节点拖入连线插入判定：节点矩形外扩距离（世界 px），略微提前触发高亮 */
export const CONNECTION_INSERT_HIT_PADDING: number = 8

/** 连线标签文字字号（px，世界坐标） */
export const CONNECTION_LABEL_FONT_SIZE: number = 14

/** 连线标签文字行高 */
export const CONNECTION_LABEL_LINE_HEIGHT: number = 1.4

/** 连线标签背景内边距（px，世界坐标） */
export const CONNECTION_LABEL_PADDING: number = 6

/** 连线标签圆角（px，世界坐标） */
export const CONNECTION_LABEL_RADIUS: number = 4

// ── 预设样式系统 ──

/** 初始分组 id（应用启动时创建的分组；与用户自定义分组地位等同，可改名/删除） */
export const DEFAULT_PRESET_GROUP_ID: string = 'default'

/** 初始分组名称（英文，直接作为数据文本写入，不随语言切换） */
export const DEFAULT_PRESET_GROUP_NAME: string = 'Default'

/** 默认节点预设（不含 id/type/groupId，store 初始化时分配 id 并归入初始分组）；名称直接用英文作为持久化数据 */
export const DEFAULT_NODE_PRESETS: Omit<NodePresetStyle, 'id' | 'type' | 'groupId'>[] = [
  { name: 'Default', borderColor: '#7d7d7dff' },
  { name: 'Blue', borderColor: '#3b82f6' },
  { name: 'Green', borderColor: '#22c55e' },
  { name: 'Yellow', borderColor: '#eab308' },
  { name: 'Red', borderColor: '#ef4444' },
  { name: 'Purple', borderColor: '#a855f7' },
  { name: 'Pink', borderColor: '#ec4899' },
]

/** 默认连线预设（同 DEFAULT_NODE_PRESETS，store 初始化时分配 id 并归入初始分组） */
export const DEFAULT_CONNECTION_PRESETS: Omit<ConnectionPresetStyle, 'id' | 'type' | 'groupId'>[] = [
  { name: 'Default', lineStyle: 'solid', strokeWidth: 2, strokeColor: '#6b7280', directed: true, applyText: false },
  { name: 'Blue Arrow', lineStyle: 'solid', strokeWidth: 3, strokeColor: '#3b82f6', directed: true, applyText: false },
  { name: 'Red Dashed', lineStyle: 'dashed', strokeWidth: 2, strokeColor: '#ef4444', directed: true, applyText: false },
  { name: 'Green Plain', lineStyle: 'solid', strokeWidth: 4, strokeColor: '#22c55e', directed: false, applyText: false },
  { name: 'Gray Dotted', lineStyle: 'dotted', strokeWidth: 1, strokeColor: '#9ca3af', directed: false, applyText: false },
]

// ── 内联视图 ──

/** 内联视图标题栏高度（世界坐标 px，随主视口缩放） */
export const INLINE_VIEW_TITLE_HEIGHT: number = 28

/** 内联视图默认矩形宽度 */
export const INLINE_VIEW_DEFAULT_WIDTH: number = 400

/** 内联视图默认矩形高度 */
export const INLINE_VIEW_DEFAULT_HEIGHT: number = 300

/** 内联视图最小矩形宽度 */
export const INLINE_VIEW_MIN_WIDTH: number = 200

/** 内联视图最小矩形高度 */
export const INLINE_VIEW_MIN_HEIGHT: number = 150

/** 内联视图自适应的边距比例（节点包围盒四周留白，0.12 = 12%） */
export const INLINE_VIEW_FIT_PADDING: number = 0.12

// ── 标签胶囊（节点右下角） ──

/** 单个标签胶囊高度（世界坐标 px） */
export const TAG_CAPSULE_HEIGHT: number = 18

/** 标签胶囊文字字号（世界坐标 px） */
export const TAG_CAPSULE_FONT_SIZE: number = 11

/** 标签胶囊左右内边距（世界坐标 px） */
export const TAG_CAPSULE_PADDING_X: number = 6

/** 相邻标签胶囊间距（世界坐标 px） */
export const TAG_CAPSULE_GAP: number = 4

/** 标签胶囊圆角（世界坐标 px） */
export const TAG_CAPSULE_RADIUS: number = 9

/** 标签胶囊与文本区底部的间距（世界坐标 px） */
export const TAG_CAPSULE_BOTTOM_GAP: number = 6

/** 节点右下角最多渲染的标签胶囊数，超出后以溢出计数 "+N" 示意 */
export const TAG_CAPSULE_MAX: number = 4
