import { ref, computed } from 'vue'
import type { WhiteboardNode, Connection } from '@/types'
import { useNodeStore } from '@/stores/node'
import { useHistoryStore } from '@/stores/history'
import { useCommands } from '@/composables/useCommands'
import { deepClone, type DataPatch, type NodeChange, type ConnectionChange } from '@/utils/command'
import { generateId } from '@/utils/id'
import { createNode, createConnection } from '@/utils/factory'

/**
 * 剪贴板 composable：copy（子树+内部连线深拷贝）/cut（拷贝后删原）/paste（新 ID 克隆入栈）。
 * 剪贴板内容为模块级持久且不入历史；剪切/粘贴操作经命令层可撤销。
 * 复制用临时 key 建 id 映射，粘贴重建 parentId 与连线端点引用，连线仅两端都在集内时随迁。
 */

/** 剪贴板节点条目（保留子树层级关系） */
interface ClipboardNode {
  /** 临时 key（本次复制集合内唯一） */
  key: number
  /** 父节点在复制集合内的 key；null 表示顶层节点（粘贴到当前视图） */
  parentKey: number | null
  /** 节点深拷贝（不含 connections，连线单独收集） */
  node: WhiteboardNode
}

/** 剪贴板连线条目（端点用 key 引用） */
interface ClipboardConnection {
  fromKey: number
  toKey: number
  /** 连线深拷贝（含样式 / 有向 / 文字） */
  conn: Connection
}

/** 剪贴板数据：节点子树 + 内部连线 */
interface ClipboardData {
  nodes: ClipboardNode[]
  connections: ClipboardConnection[]
}

/** 每次粘贴的位置偏移（逐次递增，避免完全重叠） */
const PASTE_OFFSET = 24

// ── 模块级剪贴板内容（跨组件 / 跨视图持久；不入历史栈）──
const clipboardData = ref<ClipboardData | null>(null)
/** 已粘贴次数（用于递增偏移） */
let pasteCount = 0

/** 剪贴板是否有可粘贴内容 */
const canPaste = computed(
  () => clipboardData.value !== null && clipboardData.value.nodes.length > 0,
)

export function useClipboard() {
  const nodeStore = useNodeStore()
  const history = useHistoryStore()
  const commands = useCommands()

  /** 复制选中节点到剪贴板：收集整个子树与内部连线，纯读取不入历史。 */
  function copy(ids: string[]): boolean {
    if (ids.length === 0) return false

    // ── 1. 收集整个子树 id 集合 ──
    const subIds = new Set<string>()
    for (const id of ids) {
      for (const d of nodeStore.descendantsOf(id)) subIds.add(d)
    }

    // ── 2. 为每个节点分配临时 key ──
    const idToKey = new Map<string, number>()
    let nextKey = 1
    for (const id of subIds) idToKey.set(id, nextKey++)

    // ── 3. 收集节点深拷贝 + 内部连线 ──
    const nodes: ClipboardNode[] = []
    const connections: ClipboardConnection[] = []
    const capturedKeys = new Set<string>()

    for (const id of idToKey.keys()) {
      const node = nodeStore.getNode(id)
      if (!node) continue

      const parentKey =
        node.parentId && idToKey.has(node.parentId) ? idToKey.get(node.parentId)! : null
      nodes.push({ key: idToKey.get(id)!, parentKey, node: deepClone(node) })

      // 连线来源：本节点 children 间的连线（存于本节点 connections）
      //           本节点与其兄弟间的连线（存于父节点 connections）
      const connSources: Connection[] = [...node.connections]
      if (node.parentId) {
        const parent = nodeStore.getNode(node.parentId)
        if (parent) connSources.push(...parent.connections)
      }
      for (const c of connSources) {
        const fk = idToKey.get(c.fromNodeId)
        const tk = idToKey.get(c.toNodeId)
        // 两端都必须在复制集合内（内部连线才随迁）
        if (!fk || !tk) continue
        const ckey = `${fk}:${tk}`
        if (capturedKeys.has(ckey)) continue
        capturedKeys.add(ckey)
        connections.push({ fromKey: fk, toKey: tk, conn: deepClone(c) })
      }
    }

    clipboardData.value = { nodes, connections }
    pasteCount = 0
    return nodes.length > 0
  }

  /** 剪切：复制到剪贴板后删除原节点（经命令层可撤销，剪贴板内容保留）。 */
  function cut(ids: string[]): boolean {
    if (ids.length === 0) return false
    if (!copy(ids)) return false
    commands.deleteNodes(ids)
    return true
  }

  /** 粘贴到指定父节点视图：新 ID 克隆入历史栈（可撤销）；返回顶层节点 id 列表 */
  function paste(parentId: string): string[] {
    const data = clipboardData.value
    if (!data || data.nodes.length === 0) return []

    const offset = PASTE_OFFSET * (pasteCount + 1)
    pasteCount += 1

    // ── 1. 为每个剪贴板节点生成新 id ──
    const keyToNewId = new Map<number, string>()
    for (const item of data.nodes) keyToNewId.set(item.key, generateId())

    // ── 2. 创建节点（重建 parentId / 位置偏移），并收集 add 变更 ──
    const nodeChanges: NodeChange[] = []
    const newTopIds: string[] = []
    for (const item of data.nodes) {
      const newId = keyToNewId.get(item.key)!
      const newParentId =
        item.parentKey != null ? keyToNewId.get(item.parentKey)! : parentId
      const src = item.node
      const newNode = createNode({
        id: newId,
        parentId: newParentId,
        x: src.x + offset,
        y: src.y + offset,
        width: src.width,
        height: src.height,
        text: src.text,
        borderColor: src.borderColor,
        tagIds: [...(src.tagIds ?? [])],
      })
      nodeStore.nodes.set(newId, newNode)
      nodeChanges.push({ type: 'add', id: newId, new: deepClone(newNode) })
      if (item.parentKey == null) newTopIds.push(newId)
    }

    // ── 3. 重建内部连线，并收集 add 变更 ──
    const connChanges: ConnectionChange[] = []
    for (const c of data.connections) {
      const fromId = keyToNewId.get(c.fromKey)!
      const toId = keyToNewId.get(c.toKey)!
      const fromNode = nodeStore.getNode(fromId)
      if (!fromNode?.parentId) continue
      const hostParent = nodeStore.getNode(fromNode.parentId)
      if (!hostParent) continue
      const conn = createConnection({
        fromNodeId: fromId,
        toNodeId: toId,
        lineStyle: c.conn.lineStyle,
        strokeWidth: c.conn.strokeWidth,
        strokeColor: c.conn.strokeColor,
        directed: c.conn.directed,
        text: c.conn.text,
      })
      if (!hostParent.connections.some((x) => x.id === conn.id)) {
        hostParent.connections.push(conn)
        connChanges.push({
          type: 'add',
          parentId: fromNode.parentId,
          connectionId: conn.id,
          connection: deepClone(conn),
        })
      }
    }

    // ── 4. 入历史栈（可撤销）──
    history.pushCommand({ nodeChanges, connChanges })

    return newTopIds
  }

  return {
    copy,
    cut,
    paste,
    canPaste,
  }
}