// 类型聚合出口：统一重导出各子类型模块。
export type { WhiteboardNode, NodeStyle, Connection, LineStyle, Tag, NodePresetStyle, ConnectionPresetStyle, PresetStyleItem, PresetGroup } from './node'
export type { StageConfig, CanvasPosition } from './canvas'
export type { LocaleId } from './locale'
export type {
  PluginManifest,
  ViewStats,
  ProjectStats,
  ActiveViewInfo,
  SelectionInfo,
  TreeVisitInfo,
} from './plugin'