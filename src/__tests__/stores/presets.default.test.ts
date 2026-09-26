import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePresetsStore } from '@/stores/presets'

describe('presets 默认样式来源（当前分组筛选可见列表的第一项）', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('筛选为「全部」→ 取全部可见列表第一项（等同按 1）', () => {
    const s = usePresetsStore()
    s.setNodeGroupFilter('all')
    expect(s.defaultNodePreset?.id).toBe(s.nodePresets[0].id)

    s.setConnectionGroupFilter('all')
    expect(s.defaultConnectionPreset?.id).toBe(s.connectionPresets[0].id)
  })

  it('筛选为「未分组」（特殊分组）→ 取未分组预设第一项', () => {
    const s = usePresetsStore()
    const g = s.addGroup('node', '组A')
    s.addNodePreset({ name: '组内', borderColor: '#aaaaaa', groupId: g.id })
    s.addNodePreset({ name: '未分组1', borderColor: '#111111', groupId: null })
    s.addNodePreset({ name: '未分组2', borderColor: '#222222', groupId: null })

    s.setNodeGroupFilter('ungrouped')
    expect(s.currentNodeGroupId).toBeNull()
    expect(s.defaultNodePreset?.borderColor).toBe('#111111')
  })

  it('特定分组 → 取该分组首项预设', () => {
    const s = usePresetsStore()
    const g1 = s.addGroup('node', '组A')
    const p1 = s.addNodePreset({ name: '预设1', borderColor: '#123456', groupId: g1.id })
    s.addNodePreset({ name: '预设2', borderColor: '#ffffff', groupId: g1.id })

    s.setNodeGroupFilter(g1.id)
    expect(s.defaultNodePreset?.id).toBe(p1.id)
    expect(s.defaultNodePreset?.borderColor).toBe('#123456')
  })

  it('过滤后列表为空 → null（回退默认值）', () => {
    const s = usePresetsStore()
    const g = s.addGroup('node', '空组')
    s.setNodeGroupFilter(g.id)
    expect(s.defaultNodePreset).toBeNull()

    const connEmpty = s.addGroup('connection', '空连线组')
    s.setConnectionGroupFilter(connEmpty.id)
    expect(s.defaultConnectionPreset).toBeNull()
  })

  it('连线：未分组与特定分组均取首项，字段完整透传', () => {
    const s = usePresetsStore()
    const g = s.addGroup('connection', '连线组')
    s.addConnectionPreset({
      name: 'C1',
      lineStyle: 'dashed',
      strokeWidth: 4,
      strokeColor: '#112233',
      directed: true,
      applyText: false,
      groupId: null,
    })
    s.addConnectionPreset({
      name: 'C2',
      lineStyle: 'solid',
      strokeWidth: 1,
      strokeColor: '#ffffff',
      directed: false,
      applyText: false,
      groupId: g.id,
    })

    // 「全部」→ 首个（内置默认连线）
    s.setConnectionGroupFilter('all')
    expect(s.defaultConnectionPreset?.lineStyle).toBe('solid')
    expect(s.defaultConnectionPreset?.strokeWidth).toBe(2)

    // 未分组 → 首项 C1
    s.setConnectionGroupFilter('ungrouped')
    expect(s.defaultConnectionPreset?.lineStyle).toBe('dashed')
    expect(s.defaultConnectionPreset?.strokeColor).toBe('#112233')
  })
})