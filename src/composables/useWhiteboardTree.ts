import { computed, ref } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useWhiteboardStore } from '@/stores/whiteboard'
import { generateId } from '@/utils/id'
import { DEFAULT_NODE_TEXT } from '@/constants'

/** 白板树节点 */
export interface WhiteboardTreeNode {
  id: string
  name: string
  children: WhiteboardTreeNode[]
}

/** 扁平化的白板树项（供 v-for 渲染） */
export interface FlatWhiteboardItem {
  id: string
  name: string
  /** 缩进层级（根 = 0） */
  depth: number
  /** 是否有子白板 */
  hasChildren: boolean
  /** 是否展开 */
  expanded: boolean
  /** 是否根白板（项目白板，不可删除） */
  isRoot: boolean
  /** 父白板 ID（根白板为 null） */
  parentId: string | null
}

/**
 * 白板树 composable
 *
 * 基于节点 ↔ 白板关联约定（白板 ID === 关联节点 ID）构建树形结构：
 * - 根白板（项目白板）无父级，不可删除
 * - 白板 WB（= 节点 N）的父白板 = 包含节点 N 的那个白板
 * - 父子关系持久化在 WhiteboardData.parentId 中，查找 O(1)
 *
 * 提供：树构建、扁平化（带展开状态）、添加子白板、递归删除、重命名（同步节点文本）。
 */
export function useWhiteboardTree() {
  const project = useProjectStore()

  /** 根白板 ID（项目白板，列表首项） */
  const rootWhiteboardId = computed(() => project.whiteboards[0]?.id ?? '')

  /** 判断某白板是否存在于项目列表中 */
  function whiteboardExists(id: string): boolean {
    return project.whiteboards.some((w) => w.id === id)
  }

  /**
   * 递归构建以 wbId 为根的子树。
   * 子白板通过 WhiteboardData.parentId 查找（O(1) 索引），无需遍历各白板 store。
   * visited 防止循环引用导致死循环。
   */
  function buildSubtree(
    wbId: string,
    visited: Set<string>,
  ): WhiteboardTreeNode | null {
    if (!whiteboardExists(wbId)) return null
    if (visited.has(wbId)) return null
    visited.add(wbId)

    const wb = project.whiteboards.find((w) => w.id === wbId)!
    const children: WhiteboardTreeNode[] = []

    // 子白板 = parentId 指向当前白板的白板
    for (const childWb of project.whiteboards) {
      if (childWb.parentId === wbId) {
        const child = buildSubtree(childWb.id, visited)
        if (child) children.push(child)
      }
    }

    return { id: wbId, name: wb.name, children }
  }

  /** 完整白板树（根 = 项目白板） */
  const tree = computed<WhiteboardTreeNode | null>(() =>
    buildSubtree(rootWhiteboardId.value, new Set()),
  )

  // ── 展开状态 ──

  /** 展开的白板 ID 集合（根白板默认展开） */
  const expandedIds = ref<Set<string>>(
    new Set(rootWhiteboardId.value ? [rootWhiteboardId.value] : []),
  )

  /** 切换展开 / 收起 */
  function toggleExpand(id: string): void {
    const next = new Set(expandedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedIds.value = next
  }

  /** 展开（不切换收起） */
  function expand(id: string): void {
    if (expandedIds.value.has(id)) return
    const next = new Set(expandedIds.value)
    next.add(id)
    expandedIds.value = next
  }

  /** 扁平化树（根据 expandedIds 裁剪可见节点） */
  const flatTree = computed<FlatWhiteboardItem[]>(() => {
    const result: FlatWhiteboardItem[] = []
    const root = tree.value
    if (!root) return result

    function walk(
      node: WhiteboardTreeNode,
      depth: number,
      isRoot: boolean,
      parentId: string | null,
    ): void {
      const hasChildren = node.children.length > 0
      const expanded = expandedIds.value.has(node.id)
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
   * 在 parentWbId 白板中新建一个关联白板的节点，并切换到新白板。
   *
   * 1. 生成新 ID（节点 ID = 白板 ID，共用同一 ID 号）
   * 2. 在父白板 store 新建节点（hasWhiteboard=true）
   * 3. project 注册新白板（id = 新 ID，parentId = parentWbId）
   * 4. 切换到新白板
   * 5. 展开父白板（使新子白板在树中立即可见）
   */
  function addSubWhiteboard(parentWbId: string): void {
    if (!whiteboardExists(parentWbId)) return
    const newId = generateId()
    const parentStore = useWhiteboardStore(parentWbId)

    // 基于父白板现有节点数错开位置，避免完全重叠
    const count = parentStore.nodesArray.length
    const offset = 80 + (count % 6) * 24
    parentStore.addNode(offset, offset, DEFAULT_NODE_TEXT, {
      id: newId,
      hasWhiteboard: true,
      select: false,
      edit: false,
    })

    // 注册白板（白板名绑定节点文本，随后由 setNodeText 同步）；记录父级
    project.addWhiteboard(DEFAULT_NODE_TEXT, newId, parentWbId)
    project.switchWhiteboard(newId)

    // 展开父白板，使新子白板可见
    expand(parentWbId)
  }

  /**
   * 查找白板的父白板 ID（通过 WhiteboardData.parentId，O(1)）。
   * 根白板返回 null。
   */
  function findParentWhiteboard(wbId: string): string | null {
    const wb = project.whiteboards.find((w) => w.id === wbId)
    return wb?.parentId ?? null
  }

  /**
   * 递归收集某白板的所有后代白板 ID（含自身）。
   * 通过 parentId 索引查找子白板，无需遍历各白板 store。
   */
  function collectDescendants(wbId: string): string[] {
    const result: string[] = []
    const visited = new Set<string>()
    function collect(id: string): void {
      if (visited.has(id)) return
      visited.add(id)
      result.push(id)
      for (const w of project.whiteboards) {
        if (w.parentId === id) collect(w.id)
      }
    }
    collect(wbId)
    return result
  }

  /**
   * 递归删除白板及其所有子白板（子节点）。
   *
   * 1. 根白板不可删除
   * 2. 收集所有后代白板 ID（含自身）
   * 3. 从父白板删除对应节点
   * 4. 若当前活跃白板在被删子树中，先切换到根白板
   * 5. 逐个 removeWhiteboard（销毁对应 store）
   */
  function deleteWhiteboardRecursive(wbId: string): void {
    if (wbId === rootWhiteboardId.value) return
    if (!whiteboardExists(wbId)) return

    const descendants = collectDescendants(wbId)

    // 从父白板删除对应节点（连带删除其连线）
    const parentId = findParentWhiteboard(wbId)
    if (parentId) {
      const parentStore = useWhiteboardStore(parentId)
      parentStore.deleteNode(wbId)
    }

    // 若活跃白板在被删子树中，先切换到根白板
    if (descendants.includes(project.activeWhiteboardId)) {
      project.switchWhiteboard(rootWhiteboardId.value)
    }

    // 逐个删除（removeWhiteboard 内部销毁 store 并处理列表）
    for (const id of descendants) {
      project.removeWhiteboard(id)
    }
  }

  /**
   * 重命名白板，同步更新父白板中的关联节点文本。
   *
   * 节点文本是单一数据源--更新节点文本会自动同步白板名
   *（whiteboard store 的 syncLinkedWhiteboardName）。
   * 根白板无父级（无关联节点），直接重命名白板名。
   */
  function renameWhiteboard(wbId: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed) return
    const parentId = findParentWhiteboard(wbId)
    if (parentId) {
      // 非根白板：更新父白板中的关联节点文本（内部自动同步白板名）
      const parentStore = useWhiteboardStore(parentId)
      parentStore.updateNodeText(wbId, trimmed)
    } else {
      // 根白板：无关联节点，直接重命名
      project.renameWhiteboard(wbId, trimmed)
    }
  }

  return {
    rootWhiteboardId,
    tree,
    flatTree,
    expandedIds,
    toggleExpand,
    expand,
    addSubWhiteboard,
    deleteWhiteboardRecursive,
    findParentWhiteboard,
    collectDescendants,
    renameWhiteboard,
  }
}
