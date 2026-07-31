import { useActiveView } from '@/composables/useActiveView'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'

/**
 * 节点视图编排
 *
 * 跨 store 操作（nodeStore + viewStore + project）的统一入口：
 * - enterNodeView：进入选中节点的子级视图（任何节点均可进入）
 * - groupSelectedNodes：多选节点 -> 新建容器节点，reparent 选中节点 + 迁移内部连线
 * - clearNodeChildren：清空节点的所有子级（删除子树，保留节点本身）
 *
 * 相比旧设计（跨白板 store 深拷贝），组合操作退化为同 nodeStore 内的树重 parenting：
 * 仅改 parentId + 迁移连线，纯单 store 数据变更，便于未来 undo/redo。
 */
export function useNodeViewLink() {
  const active = useActiveView()

  /**
   * 进入选中节点的子级视图（切换活跃视图）。
   * 任何节点均可进入--无需"关联白板"标记。
   */
  function enterNodeView(): void {
    const nodeId = active.view.selectedNodeId
    if (!nodeId) return
    active.project.switchView(nodeId)
  }

  /**
   * 组合（多选节点场景）
   *
   * 1. 计算所有选中节点的包围盒中心
   * 2. 在当前视图新建容器节点
   * 3. 将选中节点间的内部连线从当前视图迁移到容器（保留样式）
   * 4. reparent 选中节点到容器（仅改 parentId）
   * 5. 选中容器节点
   *
   * 全部在 nodeStore 内完成，无需跨 store 复制。
   */
  function groupSelectedNodes(): void {
    const v = active.view
    const ids = Array.from(v.selectedNodeIds)
    if (ids.length < 2) return

    const nodeStore = active.nodeStore
    const project = active.project
    const currentViewId = project.activeViewId

    // ── 计算包围盒中心 ──
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const id of ids) {
      const n = nodeStore.getNode(id)
      if (!n) continue
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.width)
      maxY = Math.max(maxY, n.y + n.height)
    }
    const centerX = (minX + maxX) / 2 - DEFAULT_NODE_WIDTH / 2
    const centerY = (minY + maxY) / 2 - DEFAULT_NODE_HEIGHT / 2

    // ── 新建容器节点（在当前视图） ──
    const containerId = nodeStore.addNode(currentViewId, centerX, centerY, '组合')

    // ── 迁移内部连线（两端均在选中集合）到容器 ──
    const idSet = new Set(ids)
    const internalConnIds = nodeStore
      .getConnections(currentViewId)
      .filter((c) => idSet.has(c.fromNodeId) && idSet.has(c.toNodeId))
      .map((c) => c.id)
    nodeStore.moveConnections(currentViewId, containerId, internalConnIds)

    // ── reparent 选中节点到容器（仅改 parentId） ──
    for (const id of ids) {
      nodeStore.reparentNode(id, containerId)
    }

    // ── 选中容器节点 ──
    v.selectNode(containerId)
  }

  /**
   * 清空节点的所有子级（删除直接子节点及其子树，保留节点本身）。
   *
   * 用于"删除子视图"语义：节点变为叶子，进入其视图将看到空画布。
   *
   * 1. 收集所有直接子节点的后代
   * 2. 销毁对应 viewStore
   * 3. 若活跃视图在被清子树中，切回该节点自身
   * 4. nodeStore 删除子节点数据
   */
  function clearNodeChildren(nodeId: string): void {
    const nodeStore = active.nodeStore
    const project = active.project

    const children = nodeStore.childrenOf(nodeId)
    if (children.length === 0) return

    const allDesc: string[] = []
    for (const c of children) {
      for (const d of nodeStore.descendantsOf(c.id)) allDesc.push(d)
    }

    project.destroyViews(allDesc)

    if (allDesc.includes(project.activeViewId)) {
      project.switchView(nodeId)
    }

    nodeStore.deleteNodes(children.map((c) => c.id))
  }

  return {
    enterNodeView,
    groupSelectedNodes,
    clearNodeChildren,
  }
}
