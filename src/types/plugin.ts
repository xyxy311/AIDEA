/**
 * 插件系统：共享数据与配置契约（纯类型，不含插件实现）。
 *
 * 说明：插件侧的类型（PluginApi 分类、PluginContext / PluginAdapter / AideaPlugin）
 * 不再在此手写——它们过度冗余且与实现重复。分类 api 的接口类型**从实现派生**
 * （`ReturnType<typeof createXxxApi>`），并集中在 `src/plugin/api/`；插件运行时契约定
 * 在稳定壳 `src/plugin/adapter.ts`。本文件只保留**无依赖的共享快照 / 配置形状**：
 * - `SDK_VERSION`、`PluginManifest`
 * - 只读快照（ActiveViewInfo / SelectionInfo / TreeVisitInfo / ViewStats / ProjectStats）
 */
import type { WhiteboardNode } from './node'

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