import type { WhiteboardNode } from '@/types'
import { createNode } from '@/utils/factory'
import { ROOT_NODE_ID } from '@/stores/node'

/**
 * projectFile - 项目文件序列化 / 解析（纯函数，不依赖 store 实例）
 *
 * 文件格式（JSON 带版本号）：
 * {
 *   "version": 1,
 *   "projectName": string,          // 根节点 text
 *   "nodes": WhiteboardNode[],      // 数组，含根节点（id='root', parentId=null）
 *   "viewState": {
 *     "viewedNodeId", "stageX", "stageY", "stageScale",
 *     "expandedIds", "inlineViews", "selectedNodeIds", "selectedConnectionIds"
 *   }
 * }
 *
 * childrenIndex / referenceIndex 是 computed 派生，不落盘。
 * 连线嵌套在父节点 connections 中，随节点一起序列化。
 */

/** 项目文件格式版本号 */
export const PROJECT_FILE_VERSION = 1

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
}

/** 项目文件顶层数据结构 */
export interface ProjectFileData {
  version: number
  projectName: string
  nodes: WhiteboardNode[]
  viewState: ProjectViewState
}

/** 解析后的项目数据（不含 version） */
export interface ParsedProject {
  projectName: string
  nodes: WhiteboardNode[]
  viewState: ProjectViewState
}

/** 序列化项目为 JSON 字符串 */
export function serializeProject(
  nodes: WhiteboardNode[],
  projectName: string,
  viewState: ProjectViewState,
): string {
  const data: ProjectFileData = {
    version: PROJECT_FILE_VERSION,
    projectName,
    nodes,
    viewState,
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
    nodeById.set(n.id, n)
  }

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
  }

  return { projectName, nodes, viewState }
}