/** 节点与连线创建工厂：所有构造字段带默认值，保证对象字段完整。 */
import type { WhiteboardNode, Connection, LineStyle } from '@/types'
import {
  DEFAULT_NODE_WIDTH,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_TEXT,
  DEFAULT_NODE_STYLE,
  DEFAULT_LINE_STYLE,
  CONNECTION_STROKE_COLOR,
  CONNECTION_STROKE_WIDTH,
  DEFAULT_CONNECTION_DIRECTED,
} from '@/constants'
import { generateId } from './id'

// ===== 节点工厂 =====

/** 创建节点的可选参数（全部可选，均有默认值） */
export interface CreateNodeOptions {
  id?: string
  parentId?: string | null
  x?: number
  y?: number
  width?: number
  height?: number
  text?: string
  borderColor?: string
  connections?: Connection[]
  tagIds?: string[]
}

/** 节点工厂：默认值保证字段完整；新增字段只需在此补充默认值即可全局生效。 */
export function createNode(options: CreateNodeOptions = {}): WhiteboardNode {
  const {
    id = generateId(),
    parentId = null,
    x = 0,
    y = 0,
    width = DEFAULT_NODE_WIDTH,
    height = DEFAULT_NODE_HEIGHT,
    text = DEFAULT_NODE_TEXT,
    borderColor = DEFAULT_NODE_STYLE.borderColor,
    connections = [],
    tagIds = [],
  } = options
  return {
    id,
    parentId,
    x,
    y,
    width,
    height,
    text,
    borderColor,
    connections,
    tagIds,
  }
}

// ===== 连线工厂 =====

/** 创建连线的可选参数（全部可选，均有默认值） */
export interface CreateConnectionOptions {
  id?: string
  fromNodeId?: string
  toNodeId?: string
  lineStyle?: LineStyle
  strokeWidth?: number
  strokeColor?: string
  directed?: boolean
  text?: string | null
}

/** 连线工厂：默认值保证字段完整；未提供 id 时按两端生成确定性 id（避免重复连线）。 */
export function createConnection(options: CreateConnectionOptions = {}): Connection {
  const {
    fromNodeId = '',
    toNodeId = '',
    lineStyle = DEFAULT_LINE_STYLE,
    strokeWidth = CONNECTION_STROKE_WIDTH,
    strokeColor = CONNECTION_STROKE_COLOR,
    directed = DEFAULT_CONNECTION_DIRECTED,
    text = null,
  } = options
  const id =
    options.id ?? (fromNodeId < toNodeId ? toNodeId + fromNodeId : fromNodeId + toNodeId)
  return {
    id,
    fromNodeId,
    toNodeId,
    lineStyle,
    strokeWidth,
    strokeColor,
    directed,
    text,
  }
}
