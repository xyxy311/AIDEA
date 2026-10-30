import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCommands } from '@/composables/useCommands'
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { usePresetsStore } from '@/stores/presets'
import { DEFAULT_NODE_PRESETS, DEFAULT_NODE_STYLE } from '@/constants'

describe('useCommands 创建默认样式取自当前分组筛选可见列表第一项', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('默认「全部」→ 新节点使用可见列表第一项（首个预设）边框色', () => {
    const commands = useCommands()
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const id = commands.createNode(project.currentNodeId, 10, 10)
    expect(nodeStore.getNode(id)!.borderColor).toBe(DEFAULT_NODE_PRESETS[0].borderColor)
  })

  it('过滤后列表为空 → 新节点回退到默认边框色', () => {
    const commands = useCommands()
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const presets = usePresetsStore()
    for (const p of [...presets.nodePresets]) presets.deleteNodePreset(p.id)

    const id = commands.createNode(project.currentNodeId, 10, 10)
    expect(nodeStore.getNode(id)!.borderColor).toBe(DEFAULT_NODE_STYLE.borderColor)
  })

  it('当前节点分组非空 → 新节点边框色取分组首项', () => {
    const commands = useCommands()
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const presets = usePresetsStore()
    const g = presets.addGroup('node', '组A')
    presets.addNodePreset({ name: 'P', borderColor: '#abcdef', groupId: g.id })
    presets.setNodeGroupFilter(g.id)

    const id = commands.createNode(project.currentNodeId, 10, 10)
    expect(nodeStore.getNode(id)!.borderColor).toBe('#abcdef')
  })

  it('当前连线分组非空 → 新连线样式取分组首项', () => {
    const commands = useCommands()
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const presets = usePresetsStore()
    const g = presets.addGroup('connection', '连线组')
    presets.addConnectionPreset({
      name: 'C',
      lineStyle: 'dotted',
      strokeWidth: 5,
      strokeColor: '#f00',
      directed: false,
      applyText: false,
      groupId: g.id,
    })
    presets.setConnectionGroupFilter(g.id)

    const a = commands.createNode(project.currentNodeId, 0, 0)
    const b = commands.createNode(project.currentNodeId, 100, 0)
    commands.addConnection(project.currentNodeId, a, b)

    const conns = nodeStore.getConnections(project.currentNodeId)
    expect(conns).toHaveLength(1)
    expect(conns[0].lineStyle).toBe('dotted')
    expect(conns[0].strokeColor).toBe('#f00')
    expect(conns[0].strokeWidth).toBe(5)
    expect(conns[0].directed).toBe(false)
  })

  it('组合容器节点样式同 createNode：取可见预设列表第一项边框色', () => {
    const commands = useCommands()
    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const a = commands.createNode(project.currentNodeId, 0, 0)
    const b = commands.createNode(project.currentNodeId, 100, 0)

    const containerId = commands.groupNodes([a, b])!
    expect(nodeStore.getNode(containerId)!.borderColor).toBe(DEFAULT_NODE_PRESETS[0].borderColor)
  })
})