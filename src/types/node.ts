/** 白板节点核心数据 */
export interface WhiteboardNode {
  id: string
  /**
   * 父节点 ID。
   * null = 根/项目节点（全局唯一，无父级；其几何与样式属性无意义，
   * 因为它不会被绘制在任何父级视图中）。
   * 通过 parentId 构建节点树：子节点 = parentId 指向本节点的节点。
   */
  parentId: string | null
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
  /**
   * 本节点子级之间的连线集合。
   *
   * 连线表示同级关系（因果、时间等），非父子关系。
   * 每条连线的两端（fromNodeId / toNodeId）均为本节点的直接子节点。
   * 连线归属父节点（而非全局独立存储），使组合/移动子树时
   * 连线随父节点自然迁移，且撤销重做只需快照单一节点 Map。
   */
  connections: Connection[]
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

/** 连线线型 */
export type LineStyle = 'solid' | 'dashed' | 'dotted'

/** 节点之间的连线（同级关系） */
export interface Connection {
  id: string
  /** 起始节点 ID（须为持有该连线的父节点的直接子节点） */
  fromNodeId: string
  /** 目标节点 ID（须为持有该连线的父节点的直接子节点） */
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
