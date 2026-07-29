import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import { useWhiteboardStore } from '@/stores/whiteboard'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'
import type { WhiteboardNode } from '@/types'

/**
 * 节点 ↔ 关联白板 编排
 *
 * 跨 store 操作（project + 多个 whiteboard store）的统一入口：
 * - createLinkedWhiteboard：单选节点 -> 用节点 ID 创建白板（白板名绑定节点名）
 * - groupSelectedNodes：多选节点 -> 创建新白板，复制选中节点与内部连线，原白板删除选中节点并在中心新建关联节点
 * - enterLinkedWhiteboard：切换到选中节点关联的白板
 *
 * 关联约定：节点关联白板后，白板 ID === 节点 ID（两者共用同一个 ID 号），
 * 节点的 hasWhiteboard === true。
 */
export function useNodeWhiteboardLink() {
  const active = useActiveWhiteboard()

  /**
   * 创建关联白板（单选节点场景）
   *
   * 1. 取当前选中节点
   * 2. 以节点 ID 作为白板 ID 创建白板（白板名 = 节点文本，名称随后随节点文本绑定）
   * 3. 标记节点 hasWhiteboard = true
   *
   * 若节点已关联白板则不重复创建。
   */
  function createLinkedWhiteboard(): void {
    const board = active.board
    const nodeId = board.selectedNodeId
    if (!nodeId) return

    const node = board.nodes.get(nodeId)
    if (!node || node.hasWhiteboard) return

    // 白板 ID = 节点 ID（共用同一个 ID 号）；白板名绑定节点文本
    active.project.addWhiteboard(node.text, nodeId)
    board.setNodeHasWhiteboard(nodeId, true)
  }

  /**
   * 进入选中节点关联的白板（切换活跃白板）
   */
  function enterLinkedWhiteboard(): void {
    const board = active.board
    const nodeId = board.selectedNodeId
    if (!nodeId) return

    const node = board.nodes.get(nodeId)
    if (!node?.hasWhiteboard) return

    active.project.switchWhiteboard(nodeId)
  }

  /**
   * 组合（多选节点场景）
   *
   * 1. 计算所有选中节点的包围盒中心
   * 2. 创建新白板（generateId）
   * 3. 将选中节点深拷贝到新白板（保留原始 ID 与位置）
   * 4. 将选中节点之间的内部连线复制到新白板（保持组合内部关系）
   * 5. 复制原白板导航信息（stageX/Y/Scale）到新白板
   * 6. 不切换视图--在原白板删除选中节点及其相关连线
   * 7. 在包围盒中心新建一个节点，其 ID = 新白板 ID，hasWhiteboard = true
   */
  function groupSelectedNodes(): void {
    const board = active.board
    const ids = Array.from(board.selectedNodeIds)
    if (ids.length < 2) return

    const project = active.project

    // ── 计算包围盒中心 + 收集节点快照 ──
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const nodeSnapshots: WhiteboardNode[] = []

    for (const id of ids) {
      const n = board.nodes.get(id)
      if (!n) continue
      nodeSnapshots.push({ ...n })
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.width)
      maxY = Math.max(maxY, n.y + n.height)
    }
    if (nodeSnapshots.length === 0) return

    // 中心点（节点左上角坐标 = 包围盒中心 - 半个节点尺寸）
    const centerX = (minX + maxX) / 2 - DEFAULT_NODE_WIDTH / 2
    const centerY = (minY + maxY) / 2 - DEFAULT_NODE_HEIGHT / 2

    // ── 创建新白板 ──
    const newBoardId = project.addWhiteboard('组合')
    const newBoard = useWhiteboardStore(newBoardId)

    // ── 复制节点到新白板 ──
    for (const snapshot of nodeSnapshots) {
      newBoard.importNode(snapshot)
    }

    // ── 复制内部连线（两端均在选中集合内）到新白板 ──
    const idSet = new Set(ids)
    for (const conn of board.connections.values()) {
      if (idSet.has(conn.fromNodeId) && idSet.has(conn.toNodeId)) {
        newBoard.importConnection(conn)
      }
    }

    // ── 复制原白板导航信息 ──
    newBoard.setViewport(board.stageX, board.stageY, board.stageScale)

    // ── 原白板删除选中节点（含相关连线） ──
    board.deleteSelectedNodes()

    // ── 中心新建关联节点：ID = 新白板 ID，hasWhiteboard = true ──
    board.addNode(centerX, centerY, '组合', {
      id: newBoardId,
      hasWhiteboard: true,
      select: true,
      edit: false,
    })
  }

  return {
    createLinkedWhiteboard,
    enterLinkedWhiteboard,
    groupSelectedNodes,
  }
}
