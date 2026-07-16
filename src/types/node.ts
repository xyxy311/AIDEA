/** 白板节点核心数据 */
export interface WhiteboardNode {
  id: string
  /** 所属白板 ID */
  whiteboardId: string
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
