import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useNodeTree } from '@/composables/useNodeTree'

describe('useNodeTree', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('flatTree 初始包含根节点且 name 正确', () => {
    const { flatTree } = useNodeTree()
    expect(flatTree.value.length).toBe(1)
    expect(flatTree.value[0].id).toBe(ROOT_NODE_ID)
    expect(flatTree.value[0].name).toBe('未命名项目')
    expect(flatTree.value[0].isRoot).toBe(true)
    expect(flatTree.value[0].depth).toBe(0)
    expect(flatTree.value[0].parentId).toBeNull()
  })

  it('deleteNodeRecursive 递归删除节点及整个子树', () => {
    const nodeStore = useNodeStore()
    const { flatTree, addSubNode, deleteNodeRecursive } = useNodeTree()

    addSubNode(ROOT_NODE_ID)
    const childId = flatTree.value[1].id

    // 在子节点下再建一层，形成子树
    addSubNode(childId)
    const grandchildId = flatTree.value[2]?.id
    expect(grandchildId).toBeTruthy()

    deleteNodeRecursive(childId)

    // 子节点及其子树从树中消失，只剩根
    expect(flatTree.value.length).toBe(1)
    expect(nodeStore.getNode(childId)).toBeUndefined()
    expect(nodeStore.getNode(grandchildId!)).toBeUndefined()
  })

  it('根节点不可删除', () => {
    const nodeStore = useNodeStore()
    const { deleteNodeRecursive } = useNodeTree()

    deleteNodeRecursive(ROOT_NODE_ID)
    expect(nodeStore.getNode(ROOT_NODE_ID)).toBeTruthy()
  })

  it('renameNode 更新节点文本（单一数据源）', () => {
    const nodeStore = useNodeStore()
    const { flatTree, addSubNode, renameNode } = useNodeTree()

    addSubNode(ROOT_NODE_ID)
    const childId = flatTree.value[1].id

    renameNode(childId, '自定义名')

    // 节点文本同步
    expect(nodeStore.getNode(childId)?.text).toBe('自定义名')
    // 树中名称也同步
    expect(flatTree.value.find((i) => i.id === childId)?.name).toBe('自定义名')
  })

  it('renameNode 根节点即修改项目名', () => {
    const nodeStore = useNodeStore()
    const { renameNode } = useNodeTree()

    renameNode(ROOT_NODE_ID, '我的项目')
    expect(nodeStore.getNode(ROOT_NODE_ID)?.text).toBe('我的项目')
  })

  it('findParent 通过 parentId 查找父节点', () => {
    const { flatTree, addSubNode, findParent } = useNodeTree()

    addSubNode(ROOT_NODE_ID)
    const childId = flatTree.value[1].id

    expect(findParent(childId)).toBe(ROOT_NODE_ID)
    expect(findParent(ROOT_NODE_ID)).toBeNull()
  })
})
