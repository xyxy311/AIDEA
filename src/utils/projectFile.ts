import type { WhiteboardNode, Tag, AIConfig } from '@/types'
import { createNode } from '@/utils/factory'
import { generateId } from '@/utils/id'
import { ROOT_NODE_ID } from '@/stores/node'
import { deepClone } from '@/utils/command'

/**
 * projectFile - 项目文件序列化 / 解析（纯函数，不依赖 store 实例）
 *
 * 文件格式（JSON 带版本号）：
 * {
 *   "version": 1,
 *   "projectName": string,          // 根节点 text
 *   "nodes": WhiteboardNode[],      // 数组，含根节点（id='root', parentId=null）
 *   "tags": Tag[],                  // 项目级标签定义
 *   "viewState": {
 *     "viewedNodeId", "stageX", "stageY", "stageScale",
 *     "expandedIds", "inlineViews", "selectedNodeIds", "selectedConnectionIds"
 *   },
 *   "additions": {                  // 插件项目化数据（键 → 插件原始数据，保存时全量写出）
 *     "stats:counter": { "count": 3 }
 *   }
 * }
 *
 * childrenIndex / referenceIndex 是 computed 派生，不落盘。
 * 连线嵌套在父节点 connections 中，随节点一起序列化。
 */

/** 项目文件格式版本号 */
export const PROJECT_FILE_VERSION = 1

/** 可持久化的标签页 */
export interface ProjectViewTab {
  id?: string
  viewedNodeId: string
}

/** 可持久化的视图状态 */
export interface ProjectViewState {
  viewedNodeId: string
  stageX: number
  stageY: number
  stageScale: number
  expandedIds: string[]
  inlineViews: Array<{ nodeId: string; width: number; height: number }>
  selectedNodeIds: string[]
  selectedConnectionIds: string[]
  /** 标签页列表（可选：旧文件无此字段则向后兼容回退单视图） */
  tabs?: ProjectViewTab[]
  /** 活动标签页 ID（可选：旧文件无此字段） */
  activeTabId?: string | null
}

/** 项目文件顶层数据结构 */
export interface ProjectFileData {
  version: number
  projectName: string
  nodes: WhiteboardNode[]
  tags: Tag[]
  viewState: ProjectViewState
  aiConfig: ProjectAIConfigData
  /** 插件项目化扩展数据（键须匹配 `pluginId:` 前缀；无键时可为空对象） */
  additions?: Record<string, unknown>
}

/** 项目文件中可持久化的 AI 配置数据 */
export interface ProjectAIConfigData {
  globalPrompt: string
  defaultConfig: AIConfig
  nodeConfigs: Array<{ nodeId: string; config: AIConfig }>
}

/** 解析后的项目数据（不含 version） */
export interface ParsedProject {
  projectName: string
  nodes: WhiteboardNode[]
  tags: Tag[]
  viewState: ProjectViewState
  aiConfig: ProjectAIConfigData
  /** 插件项目化扩展数据（解析缺省 {}；仅保留匹配 `pluginId:` 前缀的键） */
  additions: Record<string, unknown>
}

/** 默认的 AI 配置数据（与 project store 默认一致） */
export function defaultProjectAIConfig(): ProjectAIConfigData {
  return {
    globalPrompt: '',
    defaultConfig: {
      localPrompt: '',
      mode: 'fast',
      viewTextAlgoId: 'collectAll',
    },
    nodeConfigs: [],
  }
}

/** 序列化项目为 JSON 字符串 */
export function serializeProject(
  nodes: WhiteboardNode[],
  projectName: string,
  viewState: ProjectViewState,
  tags: Tag[],
  aiConfig: ProjectAIConfigData,
  additions: Record<string, unknown>,
): string {
  const data: ProjectFileData = {
    version: PROJECT_FILE_VERSION,
    projectName,
    nodes,
    tags,
    viewState,
    aiConfig,
    additions,
  }
  return JSON.stringify(data)
}

/** 判断对象是否为合法节点（缺 id / text / borderColor 等核心字段视为非法丢弃） */
function isValidNode(value: unknown): value is WhiteboardNode {
  if (!value || typeof value !== 'object') return false
  const node = value as Record<string, unknown>
  return (
    typeof node.id === 'string' &&
    node.id.length > 0 &&
    typeof node.text === 'string' &&
    typeof node.borderColor === 'string'
  )
}

/** 判断对象是否为合法 AI 配置（结构不符回退默认） */
function isValidAIConfig(value: unknown): value is AIConfig {
  if (!value || typeof value !== 'object') return false
  const cfg = value as Record<string, unknown>
  return (
    typeof cfg.localPrompt === 'string' &&
    (cfg.mode === 'fast' || cfg.mode === 'precise') &&
    typeof cfg.viewTextAlgoId === 'string'
  )
}

/** 解析并自愈 aiConfig 字段（旧文件缺字段 → 默认；逐字段校验；nodeConfigs 过滤悬空引用） */
function parseAIConfig(raw: unknown, nodeById: ReadonlyMap<string, WhiteboardNode>): ProjectAIConfigData {
  if (!raw || typeof raw !== 'object') return defaultProjectAIConfig()
  const o = raw as Record<string, unknown>
  const globalPrompt = typeof o.globalPrompt === 'string' ? o.globalPrompt : ''
  const defaultConfig = isValidAIConfig(o.defaultConfig)
    ? (o.defaultConfig as AIConfig)
    : defaultProjectAIConfig().defaultConfig
  const nodeConfigs: Array<{ nodeId: string; config: AIConfig }> = []
  if (Array.isArray(o.nodeConfigs)) {
    for (const item of o.nodeConfigs) {
      if (!item || typeof item !== 'object') continue
      const it = item as Record<string, unknown>
      if (
        typeof it.nodeId === 'string' &&
        nodeById.has(it.nodeId) &&
        isValidAIConfig(it.config)
      ) {
        nodeConfigs.push({ nodeId: it.nodeId, config: it.config as AIConfig })
      }
    }
  }
  return { globalPrompt, defaultConfig, nodeConfigs }
}

/** 解析并校验项目文件 JSON 字符串 */
export function parseProjectFile(json: string): ParsedProject {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('文件不是有效的 JSON，无法打开')
  }

  if (!data || typeof data !== 'object') {
    throw new Error('文件格式不正确')
  }
  const raw = data as Record<string, unknown>

  // —— 校验版本 ——
  if (raw.version !== PROJECT_FILE_VERSION) {
    throw new Error(`文件版本 ${String(raw.version)} 不受支持`)
  }

  // —— 校验并过滤节点 ——
  if (!Array.isArray(raw.nodes)) {
    throw new Error('文件缺少节点数据')
  }
  const nodes: WhiteboardNode[] = (raw.nodes as unknown[]).filter(isValidNode)
  const nodeById = new Map<string, WhiteboardNode>()
  for (const n of nodes) {
    // 确保 connections 字段存在且为数组
    if (!Array.isArray(n.connections)) {
      ;(n as { connections: unknown }).connections = []
    }
    // 确保 tagIds 字段存在且为数组（旧文件可能缺失）
    if (!Array.isArray(n.tagIds)) {
      ;(n as { tagIds: unknown }).tagIds = []
    }
    nodeById.set(n.id, n)
  }

  // —— 解析并校验标签定义 ——
  const tags: Tag[] = Array.isArray(raw.tags)
    ? (raw.tags as unknown[]).filter((item): item is Tag => {
        if (!item || typeof item !== 'object') return false
        const o = item as Record<string, unknown>
        return (
          typeof o.id === 'string' &&
          typeof o.name === 'string' &&
          typeof o.color === 'string'
        )
      })
    : []
  const tagById = new Map(tags.map((tag) => [tag.id, tag]))

  // —— 确保根节点存在 ——
  let projectName = typeof raw.projectName === 'string' ? raw.projectName.trim() : ''
  if (!nodeById.has(ROOT_NODE_ID)) {
    const root = createNode({
      id: ROOT_NODE_ID,
      parentId: null,
      text: projectName || '未命名项目',
    })
    nodes.push(root)
    nodeById.set(ROOT_NODE_ID, root)
  }

  // projectName 空则回退到根节点 text
  const rootText = nodeById.get(ROOT_NODE_ID)?.text || ''
  if (!projectName) {
    projectName = rootText
  }

  // —— 校验连线：剔除两端不在节点集合内的连线 ——
  for (const n of nodes) {
    n.connections = n.connections.filter(
      (c) => !!c && nodeById.has(c.fromNodeId) && nodeById.has(c.toNodeId),
    )
    // —— 裁剪标签自愈：仅保留存在于标签定义中的 id（剔除悬空引用） ——
    n.tagIds = n.tagIds.filter((id) => tagById.has(id))
  }

  // —— 构建 viewState（逐字段校验并提供默认值） ——
  const vs = (raw.viewState ?? {}) as Record<string, unknown>
  const viewState: ProjectViewState = {
    viewedNodeId:
      typeof vs.viewedNodeId === 'string' && nodeById.has(vs.viewedNodeId)
        ? vs.viewedNodeId
        : ROOT_NODE_ID,
    stageX: typeof vs.stageX === 'number' ? vs.stageX : 0,
    stageY: typeof vs.stageY === 'number' ? vs.stageY : 0,
    stageScale: typeof vs.stageScale === 'number' ? vs.stageScale : 1,
    expandedIds: Array.isArray(vs.expandedIds)
      ? vs.expandedIds.filter((id) => typeof id === 'string' && nodeById.has(id))
      : [],
    inlineViews: Array.isArray(vs.inlineViews)
      ? vs.inlineViews.filter(
          (iv): iv is { nodeId: string; width: number; height: number } =>
            !!iv &&
            typeof (iv as { nodeId?: unknown }).nodeId === 'string' &&
            nodeById.has((iv as { nodeId: string }).nodeId),
        )
      : [],
    selectedNodeIds: Array.isArray(vs.selectedNodeIds)
      ? vs.selectedNodeIds.filter((id) => typeof id === 'string' && nodeById.has(id))
      : [],
    selectedConnectionIds: Array.isArray(vs.selectedConnectionIds)
      ? vs.selectedConnectionIds.filter((id) => typeof id === 'string')
      : [],
    // 标签页：剔除非对象项；失效 viewedNodeId 置 ROOT（与懒处理一致）；缺 id 用 generateId 补
    tabs: Array.isArray(vs.tabs)
      ? vs.tabs
          .map((tb): ProjectViewTab | null => {
            if (!tb || typeof tb !== 'object') return null
            const o = tb as Record<string, unknown>
            const viewedNodeId =
              typeof o.viewedNodeId === 'string' && nodeById.has(o.viewedNodeId)
                ? o.viewedNodeId
                : ROOT_NODE_ID
            return {
              id: typeof o.id === 'string' && o.id ? o.id : generateId(),
              viewedNodeId,
            }
          })
          .filter((tb): tb is ProjectViewTab => tb !== null)
      : undefined,
    activeTabId:
      typeof vs.activeTabId === 'string' && vs.activeTabId ? vs.activeTabId : null,
  }

  // —— 解析并自愈 AI 配置（旧文件缺字段回退默认；nodeConfigs 过滤悬空引用） ——
  const aiConfig = parseAIConfig(raw.aiConfig, nodeById)

  // —— 解析插件项目化数据 additions（对象则逐键过滤，值深拷贝；非对象 → {}） ——
  const additions: Record<string, unknown> = {}
  const rawAdd = raw.additions
  if (rawAdd && typeof rawAdd === 'object' && !Array.isArray(rawAdd)) {
    for (const [key, value] of Object.entries(rawAdd as Record<string, unknown>)) {
      if (/^[^:]+:/.test(key)) {
        additions[key] = deepClone(value)
      }
    }
  }

  return { projectName, nodes, tags, viewState, aiConfig, additions }
}