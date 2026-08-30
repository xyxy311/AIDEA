/**
 * 插件系统契约类型（纯接口，不含运行时实现）。
 *
 * 设计原则：
 * - **只增不改、向后兼容**：已发布字段/方法禁止修改签名或删除，只能新增
 *   （字段或追加尾参）。破坏性变更必须走 SDK major 升级（sdkVersion）。
 * - **单一 api 对象**：插件经 `ctx.adapter.api` 这个唯一对象查询数据（只读）
 *   或执行命令（写，内建可撤销历史）。不再有独立的"命令表/命令类/命令注册"。
 * - 插件自己新增的"命令"是一段普通函数，仅供插件自身使用，无需向主应用注册。
 */
import type { WhiteboardNode, Connection, LineStyle, Tag } from './node'

/** 适配层当前 major 版本（只增不改的契约版本号） */
export const SDK_VERSION = '0'

// ─────────────────────────────────────────────────────────────
// 插件清单
// ─────────────────────────────────────────────────────────────

/**
 * 插件清单（localStorage('aidea-plugins') 持久化字段，纯 JSON、可运行时读取）。
 * 与加载方式无关——编译期或运行时加载下结构完全一致。
 */
export interface PluginManifest {
  /** 命名空间 id（跨加载方式共享的唯一路由键，如 'stats' / 'com.example.demo'） */
  id: string
  name: string
  version: string
  description?: string
  author?: string
  /** 本插件声明的适配层版本，须与 SDK_VERSION 匹配，否则禁用 */
  sdkVersion: string
  /** 是否启用（默认 false，安装需手动启用） */
  enabled?: boolean
}

// ─────────────────────────────────────────────────────────────
// 只读快照（始终深拷贝，不引用内部 reactive）
// ─────────────────────────────────────────────────────────────

export interface ActiveViewInfo {
  viewedNodeId: string
  isMain: boolean
}

export interface SelectionInfo {
  nodeIds: string[]
  connectionIds: string[]
}

export interface TreeVisitInfo {
  node: WhiteboardNode
  depth: number
  parentId: string | null
}

export interface ViewStats {
  viewedNodeId: string
  /** 直接子级节点数 */
  childCount: number
  /** 该视图下连线数 */
  connectionCount: number
  /** 直接子级的引用名（#）数 */
  directReferenceCount: number
  /** 直接子级文本总字数 */
  totalWords: number
}

export interface ProjectStats {
  totalNodes: number
  maxDepth: number
  totalReferences: number
  /** tagId -> 命中节点数 */
  tagCounts: Record<string, number>
}

// ─────────────────────────────────────────────────────────────
// 应用 api（插件唯一的查询 / 执行入口）
// ─────────────────────────────────────────────────────────────

/**
 * 应用 api——一个对象，插件通过它查询数据或执行命令：
 * - 只读方法返回深拷贝快照，不引用内部 reactive；
 * - 写方法（createNode / setNodeText / deleteNodes / undo …）**内建可撤销历史**，
 *   调用一次即产生一条历史（原子化）。复合操作可用 `beginBatch/commitBatch`
 *   包裹为单条历史；
 * - 方法参数/返回下标保持"只增不改"。
 */
// ─────────────────────────────────────────────────────────────
// 分类应用 api（node / connection / tag / stylePreset / project / view）
// ─────────────────────────────────────────────────────────────

/** 节点：树查询 + 节点写（增/删/文本/样式/组合/清子级） */
export interface NodeApi {
  get(id: string): WhiteboardNode | null
  children(parentId: string): WhiteboardNode[]
  hasChildren(id: string): boolean
  descendants(id: string): string[]
  pathToRoot(id: string): string[]
  /** 从根节点先序（DFS）遍历整棵树 */
  tree(visit: (info: TreeVisitInfo) => void): void
  create(parentId: string, x: number, y: number, text?: string): string
  remove(ids: string[]): void
  setText(nodeId: string, text: string): { ok: boolean; conflictRef?: string }
  setTexts(ids: string[], text: string): { ok: boolean; conflictRef?: string }
  setStyle(ids: string[], partial: { borderColor?: string }): void
  /** 应用节点预设样式（走可撤销写入） */
  applyPreset(nodeId: string, preset: { borderColor: string }): void
  group(ids: string[]): string | null
  clearChildren(parentId: string): void
}

/** 连线：查询 + 连线写（增/删/改样式） */
export interface ConnectionApi {
  list(parentId: string): Connection[]
  find(connectionId: string): { parentId: string; connection: Connection } | null
  add(parentId: string, fromNodeId: string, toNodeId: string): string | null
  remove(parentId: string, connIds: string[]): void
  removeByIds(connIds: string[]): void
  update(
    parentId: string,
    connectionId: string,
    partial: Partial<Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed' | 'text'>>,
  ): void
  updateStyleByIds(
    connIds: string[],
    partial: { lineStyle?: LineStyle; strokeWidth?: number; strokeColor?: string; directed?: boolean; text?: string | null },
  ): void
  /** 应用连线预设样式（走可撤销写入） */
  applyPreset(
    parentId: string,
    connectionId: string,
    preset: Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed'>,
  ): void
}

/** 标签：只读（标签定义 CRUD 为项目级操作，后续按需开放） */
export interface TagApi {
  list(): Tag[]
  get(id: string): Tag | undefined
}

/** 预设（node/connection）增删改。预留：presets store 接入后填充（应用预设见 node/connection）。 */
export interface StylePresetApi {
  // 待 presets 数据层落地后定义：list / add / update / remove
}

/** 项目：历史控制 + 批量 + 项目统计 */
export interface ProjectApi {
  canUndo(): boolean
  canRedo(): boolean
  undo(): void
  redo(): void
  clearHistory(): void
  /** 多步写合并为单条历史 */
  beginBatch(): void
  commitBatch(): void
  rollbackBatch(): void
  stats(): ProjectStats
}

/** 视图：活动视图 / 选中 / 视图切换 + 视图统计 */
export interface ViewApi {
  active(): ActiveViewInfo
  selection(): SelectionInfo
  switch(nodeId: string): void
  select(nodeId: string, ctrlKey?: boolean): void
  clearSelection(): void
  stats(): ViewStats
}

/**
 * 应用 api——插件唯一的查询 / 执行入口，按域分包：
 * - 只读方法返回快照，不引用内部 reactive；
 * - 写方法（node/connection/project）经主应用 useCommands，内建可撤销历史；
 * - `beginBatch/commitBatch` 把多步写合并为单条历史；
 * - 方法签名保持"只增不改"。
 */
export interface PluginApi {
  node: NodeApi
  connection: ConnectionApi
  tag: TagApi
  /** 预留：预设增删改 */
  stylePreset: StylePresetApi
  project: ProjectApi
  view: ViewApi
}

/** 插件的完整适配层（唯一入口，经 PluginContext.adapter 提供） */
export interface PluginAdapter {
  readonly sdkVersion: string
  /** 应用 api：查询 + 执行，合一 */
  api: PluginApi
}

// ─────────────────────────────────────────────────────────────
// 插件模块与上下文
// ─────────────────────────────────────────────────────────────

/** 插件 setup 上下文（插件唯一能触碰应用能力的方式） */
export interface PluginContext {
  /** 应用 api（唯一入口） */
  adapter: PluginAdapter
  /** 插件自身清单 */
  manifest: PluginManifest
  /** 卸载时让插件自清理副作用的出口（注册项由 core 自动清理） */
  onDispose(fn: () => void): void
}

/** 插件运行时模块：插件入口文件必须默认导出它 */
export interface AideaPlugin {
  manifest: PluginManifest
  /** 装载：拿到受限上下文，在此查询数据或执行命令 */
  setup: (ctx: PluginContext) => void
  /** 卸载：插件自清理副作用 */
  teardown?: () => void
}