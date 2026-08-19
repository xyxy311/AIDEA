/**
 * NodeItem - 纯展示组件的真实挂载测试
 *
 * 用 @vue/test-utils mount + happy-dom + 真实 pinia（createPinia / setActivePinia），
 * 验证 NodeItem 的关键渲染分支，证明「路径」与「标签」确实可见：
 * - 路径行以 "/" 开头、不含项目根名（根用前导 "/" 表示）。
 * - 打标签的节点渲染标签胶囊；超出 TAG_CAPSULE_MAX 渲染 "+N" 溢出胶囊。
 * - 未打标签的节点标题右侧不渲染标签容器。
 * - NTooltip 悬停提示延迟已设为 1000ms。
 *
 * 说明：nodeStore（pinia store）初始化即创建根节点（parentId===null）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { NTooltip } from 'naive-ui'
import NodeItem from '@/components/common/NodeItem.vue'
import { useNodeStore } from '@/stores/node'
import { useTagsStore } from '@/stores/tags'
import { TAG_CAPSULE_MAX } from '@/constants'
import type { WhiteboardNode } from '@/types/node'

let pinia: Pinia

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

/** 构造 root → 节点1 → 目标 的多层路径，返回目标节点 id 与其响应式对象 */
function createTree(): { nodeStore: ReturnType<typeof useNodeStore>; leafId: string; node: WhiteboardNode } {
  const nodeStore = useNodeStore()
  const id1 = nodeStore.addNode('root', 0, 0, '节点1')
  const leafId = nodeStore.addNode(id1, 0, 0, '目标节点')
  return { nodeStore, leafId, node: nodeStore.getNode(leafId)! }
}

/** 挂载 NodeItem（注入当前 pinia） */
function mountNodeItem(node: WhiteboardNode) {
  return mount(NodeItem, {
    props: { node },
    global: { plugins: [pinia] },
  })
}

describe('NodeItem 真实渲染', () => {
  it('路径行存在且以 "/" 开头、含父节点名、不含项目根名', () => {
    const { node } = createTree()
    const wrapper = mountNodeItem(node)
    const pathEl = wrapper.find('.ni-path')
    expect(pathEl.exists()).toBe(true)
    const text = pathEl.text()
    expect(text.startsWith('/')).toBe(true)
    expect(text).toContain('节点1')
    // 根名用前导 "/" 代指，不参与展示
    expect(text).not.toContain('未命名项目')
  })

  it('打标签的节点渲染标签胶囊，含标签名', () => {
    const { nodeStore, leafId, node } = createTree()
    const tagsStore = useTagsStore()
    const tag = tagsStore.addTag('重点', '#f00000')
    nodeStore.updateNodesTags([leafId], [tag.id])

    const wrapper = mountNodeItem(node)
    const tagsEl = wrapper.find('.ni-tags')
    expect(tagsEl.exists()).toBe(true)
    const capsule = wrapper.find('.ni-capsule')
    expect(capsule.exists()).toBe(true)
    expect(capsule.text()).toContain('重点')
  })

  it('标签数超过上限时渲染 "+N" 溢出胶囊', () => {
    const { nodeStore, leafId, node } = createTree()
    const tagsStore = useTagsStore()
    // 构造 上限 + 1 个标签，确保触发溢出分支
    const tagIds = Array.from({ length: TAG_CAPSULE_MAX + 1 }, (_, i) =>
      tagsStore.addTag(`标签${i}`, '#00ff00').id,
    )
    nodeStore.updateNodesTags([leafId], tagIds)

    const wrapper = mountNodeItem(node)
    // 正胶囊量上限个 + 1 个溢出胶囊
    expect(wrapper.findAll('.ni-capsule').length).toBe(TAG_CAPSULE_MAX + 1)
    const overflowEl = wrapper.find('.ni-capsule-overflow')
    expect(overflowEl.exists()).toBe(true)
    expect(overflowEl.text()).toContain('+1')
  })

  it('未打标签的节点标题右侧不渲染标签容器', () => {
    const { node } = createTree()
    const wrapper = mountNodeItem(node)
    expect(wrapper.find('.ni-tags').exists()).toBe(false)
  })

  it('NTooltip 悬停提示延迟设为 1000ms', () => {
    const { node } = createTree()
    const wrapper = mountNodeItem(node)
    const tooltip = wrapper.findComponent(NTooltip)
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.props('delay')).toBe(1000)
  })
})