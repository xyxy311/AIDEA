/**
 * api/node.ts —— 节点域：树查询 + 节点写
 * 接口类型由实现派生（`NodeApi = ReturnType<typeof createNodeApi>`），不再手写。
 */
import type { NodeStyle, WhiteboardNode } from '@/types/node'
import type { TreeVisitInfo } from '@/types/plugin'
import { useNodeStore } from '@/stores/node'
import { usePresetsStore } from '@/stores/presets'
import { useCommands } from '@/composables/useCommands'
import { DEFAULT_NODE_STYLE, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'
import { walkTree } from './shared'

export function createNodeApi() {
  const api = {
    get(id: string): WhiteboardNode | null {
      return useNodeStore().getNode(id) ?? null
    },
    children(parentId: string): WhiteboardNode[] {
      return useNodeStore().childrenOf(parentId)
    },
    hasChildren(id: string): boolean {
      return useNodeStore().hasChildren(id)
    },
    descendants(id: string): string[] {
      return useNodeStore().descendantsOf(id)
    },
    pathToRoot(id: string): string[] {
      return useNodeStore().pathToRoot(id)
    },
    /** 从根节点先序(DFS)遍历整棵树 */
    tree(visit: (info: TreeVisitInfo) => void): void {
      walkTree(useNodeStore(), visit)
    },
    create(parentId: string, x: number, y: number, text?: string): string {
      return useCommands().createNode(parentId, x, y, text)
    },
    remove(ids: string[]): void {
      useCommands().deleteNodes(ids)
    },
    setText(nodeId: string, text: string): { ok: boolean; conflictRef?: string } {
      return useCommands().setNodeText(nodeId, text)
    },
    setTexts(ids: string[], text: string): { ok: boolean; conflictRef?: string } {
      return useCommands().setNodesText(ids, text)
    },
    setStyle(ids: string[], partial: Partial<NodeStyle>): void {
      // 注意：store 仅持久化 borderColor 一个 per-node 样式字段，
      // 其余 NodeStyle 字段为全局常量，传入亦被忽略（类型上向前兼容）。
      useCommands().updateNodesStyle(ids, partial)
    },
    /** 应用节点预设样式（走可撤销写入） */
    applyPreset(nodeId: string, preset: { borderColor: string }): void {
      useCommands().updateNodesStyle([nodeId], { borderColor: preset.borderColor })
    },
    /**
     * 按预设 ID 应用节点预设样式（走可撤销命令层）。
     * 预设或节点不存在返回 false，不写历史。
     */
    applyPresetById(nodeId: string, presetId: string, user?: string): boolean {
      // 预留：操作者归因（未来联网协作/可视化历史）；当前版本不消费
      void user
      const preset = usePresetsStore().nodePresets.find((p) => p.id === presetId)
      if (!preset || !useNodeStore().getNode(nodeId)) return false
      useCommands().updateNodesStyle([nodeId], { borderColor: preset.borderColor })
      return true
    },
    group(ids: string[]): string | null {
      return useCommands().groupNodes(ids)
    },
    clearChildren(parentId: string): void {
      useCommands().clearNodeChildren(parentId)
    },

    // ── 命令层写（均委托 useCommands）──

    /**
     * 批量调整节点尺寸。
     * commitNodeResize 实际签名是 (nodeId, oldState, newState)，
     * 故逐节点构造 old/new 全量状态后分别入栈（每个节点一条历史）。
     */
    resize(ids: string[], size: { width: number; height: number }, user?: string): void {
      // 预留：操作者归因（未来联网协作/可视化历史）；当前版本不消费
      void user
      const store = useNodeStore()
      for (const id of ids) {
        const n = store.getNode(id)
        if (!n) continue
        const oldState = { x: n.x, y: n.y, width: n.width, height: n.height }
        // 先经 store.resizeNode 实际改写数据（内部会 fitNodeToText，可能微调尺寸），
        // 再从 store 读取最终状态入栈（与 CanvasStage transform-end 同法）。
        store.resizeNode(id, n.x, n.y, size.width, size.height)
        const after = store.getNode(id)!
        useCommands().commitNodeResize(id, oldState, {
          x: after.x,
          y: after.y,
          width: after.width,
          height: after.height,
        })
      }
    },

    /**
     * 批量平移节点（位移 delta）。
     * commitNodeMove 实际接收 positions 数组（含旧/新坐标），仅入栈不写数据，
     * 故先经 store.moveNode 变更数据，再构造 positions 入栈。
     */
    move(ids: string[], delta: { dx: number; dy: number }, user?: string): void {
      // 预留：操作者归因（未来联网协作/可视化历史）；当前版本不消费
      void user
      const store = useNodeStore()
      const positions: Array<{ id: string; oldX: number; oldY: number; newX: number; newY: number }> = []
      for (const id of ids) {
        const n = store.getNode(id)
        if (!n) continue
        // 注意：n 是 store 响应式对象的活引用，moveNode 会原地改它，
        // 必须先缓存旧坐标再写入。
        const oldX = n.x
        const oldY = n.y
        const newX = oldX + delta.dx
        const newY = oldY + delta.dy
        store.moveNode(id, newX, newY)
        positions.push({ id, oldX, oldY, newX, newY })
      }
      useCommands().commitNodeMove(positions)
    },

    /**
     * 跨父级迁移节点。reparentTo 实际签名是 (nodeIds, targetParentId, newPositions: Map)；
     * x/y 提供时为每个节点构造相同落点，否则传空 Map 保持原位。
     */
    reparent(ids: string[], newParentId: string, x?: number, y?: number, user?: string): void {
      // 预留：操作者归因（未来联网协作/可视化历史）；当前版本不消费
      void user
      const newPositions = new Map<string, { x: number; y: number }>()
      if (x !== undefined && y !== undefined) {
        for (const id of ids) newPositions.set(id, { x, y })
      }
      useCommands().reparentTo(ids, newParentId, newPositions)
    },

    alignToGrid(ids: string[], user?: string): void {
      // 预留：操作者归因（未来联网协作/可视化历史）；当前版本不消费
      void user
      useCommands().alignNodesToGrid(ids)
    },

    /** 给目标节点统一设置同一组标签（整体替换，可撤销） */
    setTags(ids: string[], tagIds: string[], user?: string): void {
      // 预留：操作者归因（未来联网协作/可视化历史）；当前版本不消费
      void user
      useCommands().updateSelectedNodesTags(ids, tagIds)
    },

    /**
     * 恢复节点默认样式。
     * useCommands 无 reset 专用命令，这里用 updateNodesStyle 写回默认 borderColor
     *（store 仅持久化该字段；其余 NodeStyle 字段为全局常量，无从 per-node 重置）。
     */
    resetStyle(ids: string[], user?: string): void {
      // 预留：操作者归因（未来联网协作/可视化历史）；当前版本不消费
      void user
      useCommands().updateNodesStyle(ids, { borderColor: DEFAULT_NODE_STYLE.borderColor })
    },

    // ── 查询（直接读 node store，返回结构化快照）──

    /** 主应用节点默认尺寸（新建节点的缺省宽高，只读快照） */
    defaultSize(): { width: number; height: number } {
      return { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT }
    },
    /** 节点 ID -> 引用名（无引用则 null）。store 无直接反向索引，经 referenceableNodes 反查。 */
    referenceOf(nodeId: string): string | null {
      const found = useNodeStore()
        .referenceableNodes()
        .find((ref) => ref.nodeId === nodeId)
      return found?.name ?? null
    },
    /** 引用名 -> 节点 ID（对照 store.getReferenceNodeId），不存在返回 null */
    getReferenceNodeId(name: string): string | null {
      return useNodeStore().getReferenceNodeId(name)
    },
    /** 所有可引用节点（引用名 -> 节点 ID） */
    referenceableNodes(): { name: string; nodeId: string }[] {
      return useNodeStore().referenceableNodes()
    },
    /** 引用名是否已被占用；excludeNodeId 缺省时视为排查任意节点 */
    isReferenceNameTaken(name: string, excludeNodeId?: string): boolean {
      return useNodeStore().isReferenceNameTaken(name, excludeNodeId ?? '')
    },
    /** 是否是某父节点的直接子节点 */
    isChildOf(childId: string, parentId: string): boolean {
      return useNodeStore().isChildOf(childId, parentId)
    },
    /** 打了某标签的节点 id 列表（反向查询） */
    nodesWithTag(tagId: string): string[] {
      return useNodeStore().nodesWithTag(tagId)
    },
    /**
     * 从所有节点移除某标签（删除标签时的联带清理）。
     * store 无对应 useCommands 命令，无法入历史，故直接调 store（不可撤销）。
     */
    stripTagFromAllNodes(tagId: string): void {
      useNodeStore().stripTagFromAllNodes(tagId)
    },
  }
  return api
}

export type NodeApi = ReturnType<typeof createNodeApi>