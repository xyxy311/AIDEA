/** 白板节点核心数据 */
export interface WhiteboardNode {
  id: string
  /**
   * 父节点 ID。null = 根/项目节点（不绘制在任何父级视图）。
   * 子节点 = parentId 指向本节点的节点。
   */
  parentId: string | null
  x: number
  y: number
  width: number
  height: number
  text: string
  /**
   * 本节点打上的标签 id 列表（引用 Tag 定义，见 tags store）。
   */
  tagIds: string[]
  /**
   * 边框颜色（支持 #rrggbbaa/rgba），节点的唯一可定制样式字段（始终有值，默认值由 createNode 填充）。
   * 文字色随主题，背景色由本字段经 deriveBackgroundColor 派生。
   */
  borderColor: string
  /**
   * 本节点子级之间的连线（表示同级关系，非父子关系），两端均为直接子节点。
   * 连线归属父节点存储，使移动子树时连线随父迁移，撤销只需快照单一节点 Map。
   */
  connections: Connection[]
}

/**
 * 节点视觉样式（全局默认，非 per-node 数据）：仅 borderColor 为可调字段，
 * 其余为统一常量；文字色随主题、背景色由 borderColor 派生。
 */
export interface NodeStyle {
  borderColor: string
  borderWidth: number
  borderRadius: number
  fontSize: number
  fontFamily: string
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
  /**
   * 连线上的文字标注（可为 null 表示无文字）。
   * 双击连线可编辑，也可在右侧边栏修改。
   */
  text: string | null
}

/** 标签定义（项目级，随项目文件序列化），由 WhiteboardNode.tagIds 引用。 */
export interface Tag {
  id: string
  name: string
  /** 标签颜色（hex） */
  color: string
}

// ===== 预设样式系统 =====

/** 节点预设样式（持久化到 localStorage）：仅存边框颜色，文字色随主题、背景色由边框色派生。 */
export interface NodePresetStyle {
  id: string
  name: string
  type: 'node'
  borderColor: string
  /** 所属分组 id；null = 未分组 */
  groupId: string | null
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
  /** 应用预设时是否把预设名称写入连线文字（false = 不修改连线文字） */
  applyText: boolean
  /** 所属分组 id；null = 未分组 */
  groupId: string | null
}

/** 预设样式统一类型 */
export type PresetStyleItem = NodePresetStyle | ConnectionPresetStyle

/** 预设分组；应用初始提供的分组与用户自定义分组地位等同，均可改名/删除。 */
export interface PresetGroup {
  id: string
  name: string
}
