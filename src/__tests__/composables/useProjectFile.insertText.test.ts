/** insertNodeText（从文本插入）：解析缩进文本 → 当前视图节点下建树 → 预设样式 → 单条历史可撤销 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DEFAULT_NODE_STYLE } from '@/constants'

const messageMock = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }

vi.mock('naive-ui', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, useMessage: () => messageMock }
})

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('useProjectFile.insertNodeText', () => {
  it(
    '把 0 缩进节点作为当前视图观察节点的子树插入，子树层级正确',
    async () => {
      const { useNodeStore } = await import('@/stores/node')
      const { useProjectStore } = await import('@/stores/project')
      const { usePresetsStore } = await import('@/stores/presets')
      const { useProjectFile } = await import('@/composables/useProjectFile')

      const node = useNodeStore()
      const project = useProjectStore()
      const viewId = node.addNode('root', 0, 0, '当前视图')
      project.switchView(viewId)
      expect(project.currentNodeId).toBe(viewId)

      const projectFile = useProjectFile()
      const count = projectFile.insertNodeText('A\n\tA1\nB')

      expect(count).toBe(3)
      const kids = node.childrenOf(viewId)
      expect(kids.map((n) => n.text)).toEqual(['A', 'B'])
      const a = kids.find((n) => n.text === 'A')!
      const b = kids.find((n) => n.text === 'B')!
      expect(node.childrenOf(a.id).map((n) => n.text)).toEqual(['A1'])
      expect(a.parentId).toBe(viewId)
      expect(b.parentId).toBe(viewId)

      // 样式：取当前节点预设分组第一项；空则回退到默认样式
      const presets = usePresetsStore()
      expect(a.borderColor).toBe(
        presets.defaultNodePreset?.borderColor ?? DEFAULT_NODE_STYLE.borderColor,
      )
    },
    30000,
  )

  it('空 / 空白输入返回 0，不产生节点', async () => {
    const { useNodeStore } = await import('@/stores/node')
    const { useProjectFile } = await import('@/composables/useProjectFile')

    const node = useNodeStore()
    const before = node.nodes.size
    const projectFile = useProjectFile()

    expect(projectFile.insertNodeText('')).toBe(0)
    expect(projectFile.insertNodeText('  \n\t\n')).toBe(0)
    expect(node.nodes.size).toBe(before)
  }, 30000)

  it(
    '整次插入是单条历史：一次 undo 全部移除，redo 全部恢复',
    async () => {
      const { useNodeStore } = await import('@/stores/node')
      const { useProjectStore } = await import('@/stores/project')
      const { useHistoryStore } = await import('@/stores/history')
      const { useProjectFile } = await import('@/composables/useProjectFile')

      const node = useNodeStore()
      const project = useProjectStore()
      const viewId = node.addNode('root', 0, 0, '当前视图')
      project.switchView(viewId)

      const projectFile = useProjectFile()
      projectFile.insertNodeText('A\n\tA1\n\tA2')
      expect(node.childrenOf(viewId).length).toBe(1)

      const history = useHistoryStore()
      history.undo()
      expect(node.childrenOf(viewId).length).toBe(0)
      // 子树节点也应随 remove 一并清掉
      const all = Array.from(node.nodes.values()).map((n) => n.text)
      expect(all).not.toContain('A1')

      history.redo()
      expect(node.childrenOf(viewId).length).toBe(1)
      expect(node.childrenOf(viewId)[0]!.text).toBe('A')
    },
    30000,
  )

  it(
    '插入整体位于现有节点包围盒右侧之外',
    async () => {
      const { useNodeStore } = await import('@/stores/node')
      const { useProjectStore } = await import('@/stores/project')
      const { useProjectFile } = await import('@/composables/useProjectFile')

      const node = useNodeStore()
      const project = useProjectStore()
      const viewId = node.addNode('root', 0, 0, '当前视图')
      project.switchView(viewId)
      // 先放一个现有子节点（占据右下区域），再插入
      const existingId = node.addNode(viewId, 300, 200, '已有')
      node.moveNode(existingId, 300, 200)

      const projectFile = useProjectFile()
      projectFile.insertNodeText('X\n\tX1')

      const existing = node.getNode(existingId)!
      // 插入的最左 x 应 > 现有包围盒最右 x（在其右侧之外）
      const inserted = node.childrenOf(viewId).filter((n) => n.text !== '已有')
      expect(inserted.length).toBeGreaterThan(0)
      for (const n of inserted) {
        expect(n.x).toBeGreaterThanOrEqual(existing.x + existing.width)
      }
    },
    30000,
  )
})