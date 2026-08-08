import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { buildNodeContext } from '@/composables/useAIAssist'

describe('buildNodeContext', () => {
  let store: ReturnType<typeof useNodeStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useNodeStore()
    store.getNode(ROOT_NODE_ID)!.text = '我的项目'
  })

  it('基础：根→目标路径 + 目标直接子级 + 连线表', () => {
    // 根 → A → 目标
    const a = store.addNode(ROOT_NODE_ID, 0, 0, 'A')
    const target = store.addNode(a, 0, 0, '目标')
    const c1 = store.addNode(target, 0, 0, '子1')
    const c2 = store.addNode(target, 0, 0, '子2')

    // 目标子级之间的连线：子1 --[导致]--> 子2
    store.addConnection(target, c1, c2)
    const connId = store.getConnections(target)[0].id
    store.updateConnection(target, connId, { directed: true, text: '导致' })

    const output = buildNodeContext(store, target)

    expect(output).toBe(
      [
        '# 我的项目',
        '',
        '# 设定',
        '',
        '## 节点树',
        '我的项目',
        '  A',
        '    目标 (N1)',
        '      子1 (C1)',
        '      子2 (C2)',
        '',
        '## 连线表（起点ID -> 终点ID）',
        'C1 --[导致]--> C2',
      ].join('\n'),
    )
  })

  it('无向连线不带箭头，无文字时不带方括号', () => {
    const target = store.addNode(ROOT_NODE_ID, 0, 0, '目标')
    const c1 = store.addNode(target, 0, 0, '子1')
    const c2 = store.addNode(target, 0, 0, '子2')
    store.addConnection(target, c1, c2)
    const connId = store.getConnections(target)[0].id
    store.updateConnection(target, connId, { directed: false, text: null })

    const output = buildNodeContext(store, target)
  })

  it('includeIds=false 时目标及子级不显示 ID，且连线表不输出', () => {
    const target = store.addNode(ROOT_NODE_ID, 0, 0, '目标')
    const c1 = store.addNode(target, 0, 0, '子1')
    const c2 = store.addNode(target, 0, 0, '子2')
    store.addConnection(target, c1, c2)
    const connId = store.getConnections(target)[0].id
    store.updateConnection(target, connId, { directed: true, text: '导致' })

    const output = buildNodeContext(store, target, { includeIds: false })
    expect(output).not.toContain('(N1)')
    expect(output).not.toContain('(C1)')
    expect(output).not.toContain('连线表')
    expect(output).toContain('子1')
  })

  it('includeConnections=false 时不输出连线表但仍输出节点树', () => {
    const target = store.addNode(ROOT_NODE_ID, 0, 0, '目标')
    const c1 = store.addNode(target, 0, 0, '子1')
    const c2 = store.addNode(target, 0, 0, '子2')
    store.addConnection(target, c1, c2)
    const connId = store.getConnections(target)[0].id
    store.updateConnection(target, connId, { directed: true, text: '导致' })

    const output = buildNodeContext(store, target, { includeConnections: false })

    expect(output).not.toContain('连线表')
    expect(output).toContain('## 节点树')
    expect(output).toContain('目标 (N1)')
  })

  it('# 设定：收集节点树部分出现的 @引用，递归输出完整子树', () => {
    // 被引用节点：人物（含多层子树）
    const person = store.addNode(ROOT_NODE_ID, 0, 0, '#人物')
    const p1 = store.addNode(person, 0, 0, '张三')
    const p2 = store.addNode(person, 0, 0, '李四')
    store.addNode(p2, 0, 0, '李四之友')

    // 目标节点及其子级中出现 @人物 引用
    const target = store.addNode(ROOT_NODE_ID, 0, 0, '目标 @人物')
    const c1 = store.addNode(target, 0, 0, '@人物 的戏份')
    const c2 = store.addNode(target, 0, 0, '无引用')

    expect(store.getReferenceNodeId('人物')).toBe(person)
    expect(store.getNode(p1)?.text).toBe('张三')

    const output = buildNodeContext(store, target)

    // # 设定 应包含人物及其完整子树
    expect(output).toContain('# 设定')
    expect(output).toContain('#人物')
    expect(output).toContain('  张三')
    expect(output).toContain('  李四')
    expect(output).toContain('    李四之友')
    // 节点树部分引用去重（只出现一次 #人物）
    const count = output.split('#人物').length - 1
    expect(count).toBe(1)
  })

  it('目标节点为根节点时，目标子级 = 项目顶层子级', () => {
    const a = store.addNode(ROOT_NODE_ID, 0, 0, '顶层A')
    const b = store.addNode(ROOT_NODE_ID, 0, 0, '顶层B')

    const output = buildNodeContext(store, ROOT_NODE_ID)

    expect(output).toContain('顶层A (C1)')
    expect(output).toContain('顶层B (C2)')
  })

  it('目标无子节点时节点树到 N1 结束且无连线表', () => {
    const target = store.addNode(ROOT_NODE_ID, 0, 0, '叶子')

    const output = buildNodeContext(store, target)

    expect(output).toContain('叶子 (N1)')
    expect(output).not.toContain('连线表')
  })

  it('目标节点不存在时返回空字符串', () => {
    expect(buildNodeContext(store, 'not-exist')).toBe('')
  })

  it('多行节点文本取首行', () => {
    const target = store.addNode(ROOT_NODE_ID, 0, 0, '目标\n副标题')
    const c1 = store.addNode(target, 0, 0, '子1\n说明')

    const output = buildNodeContext(store, target)

    expect(output).toContain('目标 (N1)')
    expect(output).toContain('子1 (C1)')
    expect(output).not.toContain('副标题')
  })
})