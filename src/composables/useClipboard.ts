import { ref, computed } from 'vue'
import type { WhiteboardNode, Connection } from '@/types'
import { useNodeStore } from '@/stores/node'
import { useHistoryStore } from '@/stores/history'
import { useCommands } from '@/composables/useCommands'
import { deepClone, type DataPatch, type NodeChange, type ConnectionChange } from '@/utils/command'
import { generateId } from '@/utils/id'
import { createNode, createConnection } from '@/utils/factory'

/**
 * 剪贴板 composable - 复制 / 剪切 / 粘贴
 *
 * 职责：
 * - copy：将选中节点（含整个子树）与子树内部连线深拷贝到剪贴板
 * - cut：复制到剪贴板后删除原节点（经命令层，可撤销）
 * - paste：将剪贴板内容以新 ID 克隆到指定父节点视图，并重建内部连线（入历史栈，可撤销）
 *
 * 设计要点：
 * - 剪贴板【内容】为模块级（跨组件 / 跨视图持久），不随视图切换丢失，
 *   且不进入历史栈——copy 只读数据，不产生历史。
 * - 剪切 / 粘贴【操作】可撤销重做：
 *   - cut = copy + commands.deleteNodes（删除入历史栈，undo 恢复原节点）
 *   - paste = 构造完整 DataPatch（add 节点 + add 连线）经 history.pushCommand 入栈，
 *     undo 移除粘贴出的节点与连线，redo 重建。
 * - 复制时用临时数字 key 建立"旧 id -> key"映射，粘贴时用 key 重建新的
 *   parentId / 连线端点引用，避免残留旧节点 id。
 * - 内部连线：仅当连线两端都在复制集合内时随迁（含兄弟间连线与子树内连线）。
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

  /**
   * 复制选中节点到剪贴板。
   * 收集每个节点的整个子树（沿 parentId 递归），并收集全部内部连线
   * （两端均在复制集合内，含兄弟间连线与子树内连线）。
   * 纯读取，不产生历史。
   *
   * @param ids 顶层选中节点 id 列表
   * @returns 是否成功（剪贴板非空）
   */
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

  /**
   * 剪切：复制到剪贴板后删除原节点（含子树）。
   * = copy + commands.deleteNodes——删除经命令层入历史栈，undo 可恢复原节点，
   * 剪贴板内容仍保留（后续可粘贴）。
   *
   * @param ids 要剪切的节点 id 列表
   * @returns 是否成功
   */
  function cut(ids: string[]): boolean {
    if (ids.length === 0) return false
    if (!copy(ids)) return false
    commands.deleteNodes(ids)
    return true
  }

  /**
   * 粘贴到指定父节点视图（可撤销）。
   * 为剪贴板内每个节点生成新 id，重建 parentId 引用，并重建内部连线。
   * 数据写入后构造完整 DataPatch（add 节点 + add 连线）pushCommand 入历史栈，
   * undo 移除粘贴内容，redo 重建。
   *
   * @param parentId 顶层节点要粘贴到的父节点 id（通常为当前视图 viewedNodeId）
   * @returns 新建的顶层节点 id 列表（供调用方选中）
   */
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