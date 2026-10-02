import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useNodeStore } from '@/stores/node'
import { DEFAULT_NODE_TEXT } from '@/constants'
import { useViewStore } from '@/stores/view'
import { useCommands } from '@/composables/useCommands'
import { useClipboard } from '@/composables/useClipboard'

/** 节点树节点 */
export interface NodeTreeNode {
  id: string
  name: string
  children: NodeTreeNode[]
}

/** 扁平化的节点树项（供 v-for 渲染） */
export interface FlatNodeItem {
  id: string
  name: string
  /** 缩进层级（根 = 0） */
  depth: number
  /** 是否有子节点 */
  hasChildren: boolean
  /** 是否展开 */
  expanded: boolean
  /** 是否根节点（项目节点，不可删除） */
  isRoot: boolean
  /** 父节点 ID（根节点为 null） */
  parentId: string | null
}

/**
 * 节点树 composable：基于 nodeStore 的 parentId 构建树（根=项目节点不可删）。
 * 提供树构建、扁平化（带展开态，存于 project store）、新建子节点、递归删除、重命名。
 */
export function useNodeTree() {
  const project = useProjectStore()
  const nodeStore = useNodeStore()
  const commands = useCommands()
  const clipboard = useClipboard()

  /** 根节点 ID（项目节点） */
  const rootViewId = computed(() => project.rootViewId)

  /** 判断某节点是否存在 */
  function nodeExists(id: string): boolean {
    return nodeStore.nodes.has(id)
  }

  /**
   * 递归构建以 nodeId 为根的子树。
   * 子节点通过 nodeStore.childrenOf 查询（基于派生索引）。
   * visited 防止循环引用导致死循环。
   */
  function buildSubtree(nodeId: string, visited: Set<string>): NodeTreeNode | null {
    if (!nodeExists(nodeId)) return null
    if (visited.has(nodeId)) return null
    visited.add(nodeId)

    const node = nodeStore.getNode(nodeId)!
    const children: NodeTreeNode[] = []
    for (const child of nodeStore.childrenOf(nodeId)) {
      const sub = buildSubtree(child.id, visited)
      if (sub) children.push(sub)
    }

    return { id: nodeId, name: node.text, children }
  }

  /** 完整节点树（根 = 项目节点） */
  const tree = computed<NodeTreeNode | null>(() =>
    buildSubtree(project.rootViewId, new Set()),
  )

  /** 扁平化树（根据 project.expandedIds 裁剪可见节点） */
  const flatTree = computed<FlatNodeItem[]>(() => {
    const result: FlatNodeItem[] = []
    const root = tree.value
    if (!root) return result

    function walk(node: NodeTreeNode, depth: number, isRoot: boolean, parentId: string | null): void {
      const hasChildren = node.children.length > 0
      const expanded = project.expandedIds.has(node.id)
      result.push({
        id: node.id,
        name: node.name,
        depth,
        hasChildren,
        expanded,
        isRoot,
        parentId,
      })
      if (hasChildren && expanded) {
        for (const child of node.children) {
          walk(child, depth + 1, false, node.id)
        }
      }
    }

    walk(root, 0, true, null)
    return result
  })

  // ── 操作 ──

  /**
   * 在 parentViewId 视图下新建一个子节点，进入其视图。
   *
   * 1. 在父节点下新建子节点（基于现有子节点数错开位置）
   * 2. 展开父节点（使新子节点在树中立即可见）
   * 3. 进入新节点视图
   *
   * 不切换视图--新节点出现在当前视图中，用户可编辑文本；
   * 要进入子节点视图时通过 enterNodeView 单独操作。
   */
  function addSubNode(parentViewId: string): void {
    if (!nodeExists(parentViewId)) return

    const count = nodeStore.childrenOf(parentViewId).length
    const offset = 80 + (count % 6) * 24
    const newId = commands.createNode(parentViewId, offset, offset, DEFAULT_NODE_TEXT)

    // 展开父节点，使新子节点在树中可见
    project.expand(parentViewId)
    project.switchView(newId)
  }

  /**
   * 递归删除节点及其整个子树。
   * 委托命令层完成：捕获子树、删除、视图协调、入栈。
   * 根节点不可删除。
   */
  function deleteNodeRecursive(nodeId: string): void {
    if (nodeId === project.rootViewId) return
    if (!nodeExists(nodeId)) return
    commands.deleteNodes([nodeId])
  }

  /** 查找节点的父节点 ID（根节点返回 null） */
  function findParent(nodeId: string): string | null {
    return nodeStore.getNode(nodeId)?.parentId ?? null
  }

  /** 递归收集某节点的所有后代 ID（含自身） */
  function collectDescendants(nodeId: string): string[] {
    return nodeStore.descendantsOf(nodeId)
  }

  /**
   * 重命名节点（更新节点文本，单一数据源）。
   * 根节点文本即项目名。通过命令层入历史栈。
   * 返回校验结果供调用方反馈（重名冲突等）。
   */
  function renameNode(nodeId: string, name: string): { ok: boolean; conflictRef?: string } {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false }
    return commands.setNodeText(nodeId, trimmed)
  }

  // ── 剪贴板（与画布共享）──

  /** 剪贴板是否有可粘贴内容 */
  const canPaste = clipboard.canPaste

  /** 复制节点整棵子树（含内部连线）到剪贴板 */
  function copyNodeTree(nodeId: string): boolean {
    return clipboard.copy([nodeId])
  }

  /** 剪切节点子树到剪贴板并删除原节点（根节点不可剪切） */
  function cutNodeTree(nodeId: string): boolean {
    if (nodeId === project.rootViewId) return false
    return clipboard.cut([nodeId])
  }

  /** 粘贴剪贴板内容为指定节点的子节点，并展开该节点使新节点可见 */
  function pasteIntoNode(nodeId: string): string[] {
    const ids = clipboard.paste(nodeId)
    if (ids.length > 0) project.expand(nodeId)
    return ids
  }

  /**
   * 拖拽移动节点到目标节点的子级下（reparent，跨视图迁移连线），并展开目标使节点可见。
   * 根节点/环（目标为自身或后代）由命令层过滤，此处仅调用。
   */
  function moveNodeUnder(nodeId: string, targetParentId: string): void {
    commands.reparentTo([nodeId], targetParentId, new Map())
    project.expand(targetParentId)
  }

  return {
    rootViewId,
    tree,
    flatTree,
    expandedIds: project.expandedIds,
    toggleExpand: project.toggleExpand,
    expand: project.expand,
    addSubNode,
    deleteNodeRecursive,
    findParent,
    collectDescendants,
    renameNode,
    canPaste,
    copyNodeTree,
    cutNodeTree,
    pasteIntoNode,
    moveNodeUnder,
  }
}
