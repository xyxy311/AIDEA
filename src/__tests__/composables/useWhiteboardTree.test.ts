import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProjectStore } from '@/stores/project'
import { useWhiteboardStore } from '@/stores/whiteboard'
import { useWhiteboardTree } from '@/composables/useWhiteboardTree'

describe('useWhiteboardTree', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('flatTree 初始包含根白板且 name 正确', () => {
    const { flatTree } = useWhiteboardTree()
    expect(flatTree.value.length).toBe(1)
    expect(flatTree.value[0].id).toBe('default')
    expect(flatTree.value[0].name).toBe('新白板')
    expect(flatTree.value[0].isRoot).toBe(true)
    expect(flatTree.value[0].depth).toBe(0)
    expect(flatTree.value[0].parentId).toBeNull()
  })

  it('addSubWhiteboard 在父白板下创建子白板并出现在树中（含 parentId）', () => {
    const project = useProjectStore()
    const { flatTree, addSubWhiteboard } = useWhiteboardTree()

    addSubWhiteboard('default')

    // 根 + 1 个子白板
    expect(flatTree.value.length).toBe(2)
    const child = flatTree.value[1]
    expect(child.depth).toBe(1)
    expect(child.name).toBe('新节点')
    expect(child.isRoot).toBe(false)
    expect(child.parentId).toBe('default')

    // 父白板中应存在关联节点
    const defaultStore = useWhiteboardStore('default')
    const linkedNode = defaultStore.nodesArray.find((n) => n.hasWhiteboard)
    expect(linkedNode).toBeTruthy()
    expect(linkedNode!.id).toBe(child.id)

    // 新白板应已注册（含 parentId）并成为活跃白板
    const wb = project.whiteboards.find((w) => w.id === child.id)
    expect(wb).toBeTruthy()
    expect(wb!.parentId).toBe('default')
    expect(project.activeWhiteboardId).toBe(child.id)
  })

  it('deleteWhiteboardRecursive 递归删除子白板及关联节点', () => {
    const project = useProjectStore()
    const { flatTree, addSubWhiteboard, deleteWhiteboardRecursive } =
      useWhiteboardTree()

    addSubWhiteboard('default')
    const childId = flatTree.value[1].id

    deleteWhiteboardRecursive(childId)

    // 子白板从树中消失，只剩根
    expect(flatTree.value.length).toBe(1)
    expect(project.whiteboards.some((w) => w.id === childId)).toBe(false)

    // 父白板中的关联节点也被删除
    const defaultStore = useWhiteboardStore('default')
    expect(defaultStore.nodesArray.find((n) => n.id === childId)).toBeUndefined()
  })

  it('根白板不可删除', () => {
    const project = useProjectStore()
    const { deleteWhiteboardRecursive } = useWhiteboardTree()

    const before = project.whiteboards.length
    deleteWhiteboardRecursive('default')
    expect(project.whiteboards.length).toBe(before)
    expect(project.whiteboards.some((w) => w.id === 'default')).toBe(true)
  })

  it('renameWhiteboard 同步父白板中的关联节点文本', () => {
    const project = useProjectStore()
    const { flatTree, addSubWhiteboard, renameWhiteboard } = useWhiteboardTree()

    addSubWhiteboard('default')
    const childId = flatTree.value[1].id

    renameWhiteboard(childId, '自定义名')

    // 父白板中关联节点文本同步
    const defaultStore = useWhiteboardStore('default')
    const node = defaultStore.nodesArray.find((n) => n.id === childId)
    expect(node?.text).toBe('自定义名')

    // 白板名同步（节点文本 -> 白板名）
    const wb = project.whiteboards.find((w) => w.id === childId)
    expect(wb?.name).toBe('自定义名')

    // 树中名称也同步
    expect(flatTree.value.find((i) => i.id === childId)?.name).toBe('自定义名')
  })

  it('renameWhiteboard 根白板直接重命名白板名', () => {
    const project = useProjectStore()
    const { renameWhiteboard } = useWhiteboardTree()

    renameWhiteboard('default', '项目根白板')
    expect(project.whiteboards.find((w) => w.id === 'default')?.name).toBe(
      '项目根白板',
    )
  })

  it('findParentWhiteboard 通过 parentId O(1) 查找', () => {
    const { flatTree, addSubWhiteboard, findParentWhiteboard } =
      useWhiteboardTree()

    addSubWhiteboard('default')
    const childId = flatTree.value[1].id

    expect(findParentWhiteboard(childId)).toBe('default')
    expect(findParentWhiteboard('default')).toBeNull()
  })
})
