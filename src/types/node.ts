/** 白板节点核心数据 */
export interface WhiteboardNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
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
