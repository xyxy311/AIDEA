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
  textColor?: string
  backgroundColor?: string
  borderColor?: string
  connections?: Connection[]
}

/**
 * 节点工厂函数。
 *
 * 所有参数均有默认值，确保产出的节点字段完整（不为 undefined）。
 * 未来新增节点字段时，只需在此处补充默认值，所有创建点自动覆盖，
 * 避免散落在各处的对象字面量遗漏新字段。
 */
export function createNode(options: CreateNodeOptions = {}): WhiteboardNode {
  const {
    id = generateId(),
    parentId = null,
    x = 0,
    y = 0,
    width = DEFAULT_NODE_WIDTH,
    height = DEFAULT_NODE_HEIGHT,
    text = DEFAULT_NODE_TEXT,
    textColor = DEFAULT_NODE_STYLE.textColor,
    backgroundColor = DEFAULT_NODE_STYLE.backgroundColor,
    borderColor = DEFAULT_NODE_STYLE.borderColor,
    connections = [],
  } = options
  return {
    id,
    parentId,
    x,
    y,
    width,
    height,
    text,
    textColor,
    backgroundColor,
    borderColor,
    connections,
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
}

/**
 * 连线工厂函数。
 *
 * 所有参数均有默认值，确保产出的连线字段完整。
 * 未提供 id 时，使用 fromNodeId / toNodeId 生成确定性 id（与原
 * nodeStore.addConnection 逻辑一致，避免两端互换产生重复连线）。
 * 未来新增连线字段时，只需在此处补充默认值。
 */
export function createConnection(options: CreateConnectionOptions = {}): Connection {
  const {
    fromNodeId = '',
    toNodeId = '',
    lineStyle = DEFAULT_LINE_STYLE,
    strokeWidth = CONNECTION_STROKE_WIDTH,
    strokeColor = CONNECTION_STROKE_COLOR,
    directed = DEFAULT_CONNECTION_DIRECTED,
  } = options
  // 确定性 id：保持与历史逻辑一致，使同两端连线不会重复创建
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
  }
}
