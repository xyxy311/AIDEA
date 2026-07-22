/** 白板节点核心数据 */
export interface WhiteboardNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  /** 字体颜色（undefined = 使用默认值） */
  textColor?: string
  /** 背景颜色（undefined = 使用默认值） */
  backgroundColor?: string
  /** 边框颜色（undefined = 使用默认值） */
  borderColor?: string
}

/** 节点视觉样式配置 */
export interface NodeStyle {
  backgroundColor: string
  borderColor: string
  borderWidth: number
  borderRadius: number
  fontSize: number
  fontFamily: string
  textColor: string
  shadowEnabled: boolean
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
}

/** 白板（项目中的页面/视图） */
export interface WhiteboardData {
  id: string
  name: string
}

/** 连线线型 */
export type LineStyle = 'solid' | 'dashed' | 'dotted'

/** 节点之间的连线 */
export interface Connection {
  id: string
  /** 起始节点 ID */
  fromNodeId: string
  /** 目标节点 ID */
  toNodeId: string
  /** 线型：实线/虚线/点线 */
  lineStyle: LineStyle
  /** 连线粗细（px） */
  strokeWidth: number
  /** 连线颜色（hex） */
  strokeColor: string
  /** 是否有向（箭头） */
  directed: boolean
}

// ===== 预设样式系统 =====

/** 节点预设样式 */
export interface NodePresetStyle {
  id: string
  name: string
  type: 'node'
  backgroundColor: string
  borderColor: string
  textColor: string
}

/** 连线预设样式 */
export interface ConnectionPresetStyle {
  id: string
  name: string
  type: 'connection'
  lineStyle: LineStyle
  strokeWidth: number
  strokeColor: string
  directed: boolean
}

/** 预设样式统一类型 */
export type PresetStyleItem = NodePresetStyle | ConnectionPresetStyle
