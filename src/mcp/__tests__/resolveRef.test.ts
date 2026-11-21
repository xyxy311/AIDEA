// src/mcp/__tests__/resolveRef.test.ts —— 引用解析五级顺序 / C<n> 稳定性 / Nfrom>Nto / N 形名字句柄优先
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNodeStore } from '@/stores/node'
import { runTool } from '../registry'
import { nodeHandles, resolveConnRef, resolveNodeRef, ToolError } from '../tools/shared'

const ctx = { inBatch: false }

async function createRootChildren(texts: string[]): Promise<string[]> {
  const out = await runTool('aidea_node_create', { parentId: 'root', texts }, ctx)
  if (!out.ok) throw new Error(out.error)
  return (out.output as { payload: { createdIds: string[] } }).payload.createdIds
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('resolveNodeRef —— 五级解析', () => {
  it('1. 完整 nodeId 精确命中', async () => {
    const [id] = await createRootChildren(['Alpha'])
    expect(resolveNodeRef(id).id).toBe(id)
  })

  it('2. N 句柄（≥3 位前缀）命中；任意唯一前缀均接受', async () => {
    const [id] = await createRootChildren(['Alpha'])
    const handles = nodeHandles()
    const code = handles.get(id)!
    expect(resolveNodeRef(`N${code}`).id).toBe(id)
    expect(resolveNodeRef(`N${id.slice(0, 5)}`).id).toBe(id)
  })

  it('句柄解析走 id 前缀；名字解析互不干扰（§5.4 顺序）', async () => {
    const [id] = await createRootChildren(['Alpha'])
    const code = nodeHandles().get(id)!
    // id 前缀既匹配句柄，也不会被当成名字误命中其它节点
    expect(resolveNodeRef(`N${code}`).id).toBe(id)
  })

  it('3. 显示名精确命中（含 (2) 后缀）；跨视图同名歧义报候选', async () => {
    const [a, b] = await createRootChildren(['备注', '备注'])
    expect(resolveNodeRef('备注').id).toBe(a)
    expect(resolveNodeRef('备注(2)').id).toBe(b)
    // 子视图里再造一个同名 → '备注' 全局不唯一
    const [parent] = await createRootChildren(['容器'])
    await runTool('aidea_node_create', { parentId: parent, texts: ['备注'] }, ctx)
    try {
      resolveNodeRef('备注')
      expect.unreachable('should throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError)
      expect((err as Error).message).toContain('ambiguous')
      expect((err as Error).message).toContain('N') // 候选带句柄
    }
  })

  it('4. 唯一子串命中', async () => {
    await createRootChildren(['森林入口', '火山口'])
    const n = resolveNodeRef('森林')
    expect(useNodeStore().getNode(n.id)?.text.split('\n')[0]?.trim()).toBe('森林入口')
  })

  it('5. 未命中 → ToolError；子串多命中 → ToolError 附候选', async () => {
    await createRootChildren(['入口A', '入口B'])
    expect(() => resolveNodeRef('不存在')).toThrow(/not found/)
    try {
      resolveNodeRef('入口')
      expect.unreachable('should throw')
    } catch (err) {
      expect((err as Error).message).toContain('ambiguous')
    }
  })

  it('节点名恰为 N<code> 形状 → 只按句柄解析，不回退名字（§5.4）', async () => {
    await createRootChildren(['Nabc'])
    try {
      resolveNodeRef('Nabc')
      expect.unreachable('should throw (no id starts with "abc")')
    } catch (err) {
      expect((err as Error).message).toContain('handle code')
    }
    // 真句柄可达
    const store = useNodeStore()
    const target = [...store.nodes.values()].find((n) => n.text.startsWith('Nabc'))!
    const handles = nodeHandles()
    expect(resolveNodeRef(`N${handles.get(target.id)}`).id).toBe(target.id)
  })
})

describe('resolveConnRef —— D6 三种寻址', () => {
  async function setupThree() {
    const ids = await createRootChildren(['A', 'B', 'C'])
    const add = async (from: string, to: string): Promise<string> => {
      const out = await runTool('aidea_connection_add', { parentId: 'root', fromNodeId: from, toNodeId: to }, ctx)
      if (!out.ok) throw new Error(out.error)
      return (out.output as { payload: { connectionId: string } }).payload.connectionId
    }
    const c1 = await add(ids[0], ids[1])
    const c2 = await add(ids[1], ids[2])
    return { ids, c1, c2, add }
  }

  it('C<n> = 父连线表 1-based 下标；追加连线后既有编号不变', async () => {
    const { ids, c1, c2, add } = await setupThree()
    expect(resolveConnRef('C1').connection.id).toBe(c1)
    expect(resolveConnRef('C2').connection.id).toBe(c2)
    await add(ids[2], ids[0])
    expect(resolveConnRef('C1').connection.id).toBe(c1)
    expect(resolveConnRef('C2').connection.id).toBe(c2)
    expect(resolveConnRef('C3').connection.id).not.toBe(c1)
  })

  it('Nfrom>Nto 在前序连线删除后仍有效；C<n> 删除后重排（契约）', async () => {
    const { ids, c1, c2 } = await setupThree()
    await runTool('aidea_connection_remove', { connectionIds: [c1] }, ctx)
    // C1 现在指向原 C2（重排，需重新读取）
    expect(resolveConnRef('C1').connection.id).toBe(c2)
    // 端点对寻址不受重排影响
    const handles = nodeHandles()
    const pair = `N${handles.get(ids[1])}>N${handles.get(ids[2])}`
    expect(resolveConnRef(pair).connection.id).toBe(c2)
  })

  it('完整 connectionId 直达；端点对无连线/越界下标报错', async () => {
    const { ids, c1 } = await setupThree()
    expect(resolveConnRef(c1).connection.id).toBe(c1)
    expect(() => resolveConnRef('C99')).toThrow(/C<n>/)
    // 两个真实节点但无边 → no connection
    const handles = nodeHandles()
    expect(() => resolveConnRef(`N${handles.get(ids[0])}>N${handles.get(ids[2])}`)).toThrow(/no connection/)
    // 无效节点引用 → 节点级错误
    expect(() => resolveConnRef('NA>NZ')).toThrow(ToolError)
  })
})
