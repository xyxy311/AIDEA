/**
 * api/shared.ts —— 分类 api 共用的内部辅助（不对外暴露）
 */
import { useViewStore } from '@/stores/view'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import type { TreeVisitInfo } from '@/types/plugin'

/** 主视图实例（常驻，承载选中 / 视口等视图状态） */
export function mainView(): ReturnType<typeof useViewStore> {
  return useViewStore('main')
}

/** 从根节点先序(DFS)遍历整棵树，逐个回调 visit(info) */
export function walkTree(
  nodeStore: ReturnType<typeof useNodeStore>,
  visit: (info: TreeVisitInfo) => void,
): void {
  const stack: Array<{ id: string; depth: number }> = [{ id: ROOT_NODE_ID, depth: 0 }]
  while (stack.length) {
    const { id, depth } = stack.pop()!
    const node = nodeStore.getNode(id)
    if (!node) continue
    visit({ node, depth, parentId: node.parentId })
    const children = nodeStore.childrenOf(id)
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ id: children[i].id, depth: depth + 1 })
    }
  }
}