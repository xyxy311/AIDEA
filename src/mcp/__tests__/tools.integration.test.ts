// src/mcp/__tests__/tools.integration.test.ts —— 工具面集成测试（真实 pinia store + 命令层）
// 锁定 M2 验收核心：写工具一次调用 = 恰好 1 条历史；batch 原子性与首错回滚无残留。
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNodeStore } from '@/stores/node'
import { useHistoryStore } from '@/stores/history'
import { useTagsStore } from '@/stores/tags'
import { runTool, type RunToolResult } from '../registry'
import { nodeHandles } from '../tools/shared'

const ctx = { inBatch: false }

function payload<T>(result: RunToolResult): T {
  expect(result.ok).toBe(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (result as any).output.payload as T
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('写工具 = 一次调用一条历史（D5）', () => {
  it('node_create 批量创建 3 节点 → 恰好 1 条历史，节点落位 auto 布局', async () => {
    const out = payload<{ createdIds: string[]; undoHint: string }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['A', 'B', 'C'] }, ctx),
    )
    expect(out.createdIds).toHaveLength(3)
    const history = useHistoryStore()
    expect(history.past.length).toBe(1)
    const nodeStore = useNodeStore()
    for (const id of out.createdIds) {
      const n = nodeStore.getNode(id)
      expect(n?.parentId).toBe('root')
      expect(n?.y).toBe(0) // 无现有子节点 → 基准原点
    }
    // undoHint 为 host 层附加（本测试直调 runTool，不含该字段）；host 层单测见 undoHint 部分
  })

  it('undo 撤销 node_create → 节点全部消失', async () => {
    const out = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['A'] }, ctx),
    )
    await runTool('aidea_history', { action: 'undo' }, ctx)
    expect(useNodeStore().getNode(out.createdIds[0]!)).toBeUndefined()
    expect(useHistoryStore().canRedo).toBe(true)
  })

  it('node_set_text 引用名冲突 → conflicts 结构化返回且整批一条历史', async () => {
    const a = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['A', '#ref1'] }, ctx),
    ).createdIds
    const past = useHistoryStore().past.length
    const out = payload<{ applied: number; conflicts: Array<{ nodeId: string; conflictRef: string }> }>(
      await runTool(
        'aidea_node_set_text',
        { updates: [{ nodeId: a[0]!, text: '#ref1' }, { nodeId: a[1]!, text: 'renamed' }] },
        ctx,
      ),
    )
    expect(out.applied).toBe(1) // #ref1 已被 a[1] 占用
    expect(out.conflicts).toEqual([{ nodeId: a[0], conflictRef: 'ref1' }])
    expect(useHistoryStore().past.length).toBe(past + 1) // 整批一条历史
  })

  it('node_delete 含子树展开计数与上限校验', async () => {
    const parent = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['P'] }, ctx),
    ).createdIds[0]!
    await runTool('aidea_node_create', { parentId: parent, texts: ['C1', 'C2'] }, ctx)
    const out = payload<{ deletedCount: number }>(
      await runTool('aidea_node_delete', { nodeIds: [parent] }, ctx),
    )
    expect(out.deletedCount).toBe(3)
    expect(useNodeStore().nodes.size).toBe(1) // 仅剩 root
  })

  it('connection add/update/remove 与 tag apply', async () => {
    const ids = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['A', 'B'] }, ctx),
    ).createdIds
    const conn = payload<{ connectionId: string }>(
      await runTool('aidea_connection_add', { parentId: 'root', fromNodeId: ids[0], toNodeId: ids[1], text: 'rel' }, ctx),
    ).connectionId
    expect(useNodeStore().getConnections('root')).toHaveLength(1)

    const upd = payload<{ updated: number }>(
      await runTool('aidea_connection_update', { connectionIds: [conn], patch: { lineStyle: 'dashed' } }, ctx),
    )
    expect(upd.updated).toBe(1)

    const tags = payload<{ tagIds: string[]; createdTags: Array<{ id: string }> }>(
      await runTool('aidea_tag_apply', { nodeIds: ids, tagNames: ['重要', '待办'] }, ctx),
    )
    expect(tags.tagIds).toHaveLength(2)
    expect(tags.createdTags).toHaveLength(2) // 定义层新建
    expect(useTagsStore().tagList).toHaveLength(2)

    await runTool('aidea_connection_remove', { connectionIds: [conn] }, ctx)
    expect(useNodeStore().getConnections('root')).toHaveLength(0)
  })

  it('append 模式保留节点既有标签；replace 模式整体替换', async () => {
    const ids = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['A'] }, ctx),
    ).createdIds
    await runTool('aidea_tag_apply', { nodeIds: ids, tagNames: ['T1'] }, ctx)
    const append = payload<{ tagIds: string[] }>(
      await runTool('aidea_tag_apply', { nodeIds: ids, tagNames: ['T2'] }, ctx),
    )
    // tagIds = 本次调用解析出的标签 id（非节点最终集合）
    expect(append.tagIds).toHaveLength(1)
    expect(useNodeStore().getNode(ids[0]!)!.tagIds).toHaveLength(2)

    const replace = payload<{ tagIds: string[] }>(
      await runTool('aidea_tag_apply', { nodeIds: ids, tagNames: ['T3'], mode: 'replace' }, ctx),
    )
    expect(replace.tagIds).toHaveLength(1)
    expect(useNodeStore().getNode(ids[0]!)!.tagIds).toHaveLength(1)
  })
})

describe('aidea_batch（原子批，D5/T18）', () => {
  it('全部成功：多个写 op 合并为一条历史', async () => {
    const out = payload<{ ok: boolean; results: Array<{ tool: string; ok: boolean }> }>(
      await runTool(
        'aidea_batch',
        {
          ops: [
            { tool: 'aidea_node_create', args: { parentId: 'root', texts: ['A'] } },
            { tool: 'aidea_node_create', args: { parentId: 'root', texts: ['B'] } },
          ],
        },
        ctx,
      ),
    )
    expect(out.ok).toBe(true)
    expect(out.results.every((r) => r.ok)).toBe(true)
    expect(useHistoryStore().past.length).toBe(1)
  })

  it('首错整体回滚：数据无残留、历史无新增', async () => {
    const created = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['Pre'] }, ctx),
    ).createdIds
    const pastBefore = useHistoryStore().past.length

    const out = payload<{ ok: boolean; failedAt: number; failedTool: string; error: string; results: unknown[] }>(
      await runTool(
        'aidea_batch',
        {
          ops: [
            { tool: 'aidea_node_create', args: { parentId: 'root', texts: ['X'] } },
            { tool: 'aidea_node_create', args: { parentId: 'root', texts: ['Y'] } },
            { tool: 'aidea_node_delete', args: { nodeIds: ['nonexistent'] } }, // 第三步首错
          ],
        },
        ctx,
      ),
    )
    // 首错 → isError:true 的结构化载荷（host 层包装为 isError content）
    expect(out.ok).toBe(false)
    expect(out.failedAt).toBe(2)
    expect(out.failedTool).toBe('aidea_node_delete')
    expect(out.error).toContain('node ref not found')
    expect(out.results).toHaveLength(2) // 前两步成功结果保留

    const nodeStore = useNodeStore()
    expect(nodeStore.nodes.size).toBe(2) // root + Pre，X/Y 已回滚
    expect(nodeStore.getNode(created[0]!)).toBeDefined()
    const history = useHistoryStore()
    expect(history.past.length).toBe(pastBefore)
    expect(history.future.length).toBe(0) // 无 redo 残留
  })

  it('读工具被拒绝进入 batch', async () => {
    const result = await runTool('aidea_batch', { ops: [{ tool: 'aidea_board_overview' }] }, ctx)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('read tool not allowed')
  })

  it('未知工具被拒绝进入 batch', async () => {
    const result = await runTool('aidea_batch', { ops: [{ tool: 'aidea_nope' }] }, ctx)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('unknown tool')
  })
})

// ── 读接口改版（三层读模型 + 链式文本 + 句柄/名字写侧统一）──

function textOutput(result: RunToolResult): string {
  expect(result.ok).toBe(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (result as any).output.text as string
}

describe('三层读模型（T0 outline / T2 view_read / T3 node_get）', () => {
  it('I4：三个读工具都不产生历史条目', async () => {
    const ids = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['A', 'B'] }, ctx),
    ).createdIds
    await runTool('aidea_connection_add', { parentId: 'root', fromNodeId: ids[0], toNodeId: ids[1] }, ctx)
    const past = useHistoryStore().past.length
    await runTool('aidea_outline', {}, ctx)
    await runTool('aidea_view_read', {}, ctx)
    await runTool('aidea_node_get', { nodeId: 'root' }, ctx)
    expect(useHistoryStore().past.length).toBe(past)
  })

  it('outline 返回 kind:text；depth=1 只列直接子节点；全叶子退化列出叶子预览', async () => {
    await runTool('aidea_node_create', { parentId: 'root', texts: ['甲', '乙', '丙'] }, ctx)
    const result = await runTool('aidea_outline', { depth: 1 }, ctx)
    const text = textOutput(result)
    expect(text).toContain('OUTLINE /')
    expect(text).toContain('ROOT N')
    expect(text).toContain('甲')
    expect(text).toContain('(+3 子, +3 叶)')
  })

  it('view_read 返回链式文本：CHAINS / UNLINKED / 字典，边段带 C<n>', async () => {
    const ids = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['A', 'B'] }, ctx),
    ).createdIds
    await runTool('aidea_connection_add', { parentId: 'root', fromNodeId: ids[0], toNodeId: ids[1], text: '下一跳' }, ctx)
    const text = textOutput(await runTool('aidea_view_read', {}, ctx))
    expect(text).toContain('CHAINS')
    expect(text).toMatch(/\[N[^\s\]]{3,} A[^\]]*\]--C1 下一跳-->/)
    expect(text).toContain('UNLINKED')
    expect(text).toContain('STYLE')
    expect(text).toContain('LINK')
    expect(text).toContain('TAGS')
    expect(text).toContain('VIEW /')
  })

  it('view_read nodeId 接受句柄与名字；json format 返回结构化数据', async () => {
    const [containerId] = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['容器'] }, ctx),
    ).createdIds
    const [innerId] = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: containerId, texts: ['内部'] }, ctx),
    ).createdIds
    const text = textOutput(await runTool('aidea_view_read', { nodeId: '容器' }, ctx))
    expect(text).toContain('内部')
    // json 逃生口
    const result = await runTool('aidea_view_read', { nodeId: containerId, format: 'json' }, ctx)
    expect(result.ok).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (result as any).output.payload as { viewedNodeId: string; nodes: unknown[]; chains: unknown[] }
    expect(p.viewedNodeId).toBe(containerId)
    expect(p.nodes).toHaveLength(1)
    expect(p.chains).toHaveLength(0)
    void innerId
  })

  it('node_get：坐标取整 + handle/displayName', async () => {
    const ids = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['精度节点'], layout: 'row', gap: 3 }, ctx),
    ).createdIds
    await runTool('aidea_node_move', { nodeIds: [ids[0]], mode: 'delta', dx: 10.6, dy: 20.4 }, ctx)
    const result = await runTool('aidea_node_get', { nodeId: ids[0] }, ctx)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (result as any).output.payload.node as { handle: string; displayName: string; x: number; y: number }
    expect(node.handle).toMatch(/^N\w{3,}$/)
    expect(node.displayName).toBe('精度节点')
    expect(node.x).toBe(11)
    expect(node.y).toBe(20)
  })
})

describe('写侧统一：句柄 / 名字 / 预设名', () => {
  it('句柄寻址写入（读出的 handle 可直接回写）', async () => {
    const ids = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['目标'] }, ctx),
    ).createdIds
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = ((await runTool('aidea_node_get', { nodeId: ids[0] }, ctx)) as any).output.payload.node.handle as string
    const out = payload<{ applied: number }>(
      await runTool('aidea_node_set_text', { updates: [{ nodeId: handle, text: '改名后' }] }, ctx),
    )
    expect(out.applied).toBe(1)
    expect(useNodeStore().getNode(ids[0])?.text).toBe('改名后')
  })

  it('名字(2) 后缀寻址写入；同名第二个节点可区分', async () => {
    const ids = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['项目', '项目'] }, ctx),
    ).createdIds
    const out = payload<{ applied: number }>(
      await runTool('aidea_node_set_text', { updates: [{ nodeId: '项目(2)', text: '第二个' }] }, ctx),
    )
    expect(out.applied).toBe(1)
    expect(useNodeStore().getNode(ids[0])?.text).toBe('项目')
    expect(useNodeStore().getNode(ids[1])?.text).toBe('第二个')
  })

  it('节点预设名写入（borderColor 接受名字，D3）', async () => {
    const out = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['蓝色节点'], borderColor: 'Blue' }, ctx),
    )
    expect(useNodeStore().getNode(out.createdIds[0])?.borderColor.toLowerCase()).toBe('#3b82f6')
  })

  it('连线 preset 名建线 + patch preset 改样式', async () => {
    const ids = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['A', 'B'] }, ctx),
    ).createdIds
    const conn = payload<{ connectionId: string }>(
      await runTool('aidea_connection_add', { parentId: 'root', fromNodeId: ids[0], toNodeId: ids[1], preset: 'Red Dashed' }, ctx),
    ).connectionId
    const nodeStore = useNodeStore()
    const conn1 = nodeStore.findConnectionById(conn)?.connection
    expect(conn1?.lineStyle).toBe('dashed')
    expect(conn1?.strokeColor.toLowerCase()).toBe('#ef4444')

    await runTool('aidea_connection_update', { connectionIds: [conn], patch: { preset: 'Green Plain' } }, ctx)
    const conn2 = nodeStore.findConnectionById(conn)?.connection
    expect(conn2?.directed).toBe(false)
    expect(conn2?.strokeColor.toLowerCase()).toBe('#22c55e')
  })

  it('连线 C<n> 与 Nfrom>Nto 寻址删除', async () => {
    const ids = payload<{ createdIds: string[] }>(
      await runTool('aidea_node_create', { parentId: 'root', texts: ['A', 'B', 'C'] }, ctx),
    ).createdIds
    await runTool('aidea_connection_add', { parentId: 'root', fromNodeId: ids[0], toNodeId: ids[1] }, ctx)
    await runTool('aidea_connection_add', { parentId: 'root', fromNodeId: ids[1], toNodeId: ids[2] }, ctx)
    const out = payload<{ removed: number }>(
      await runTool('aidea_connection_remove', { connectionIds: ['C2'] }, ctx),
    )
    expect(out.removed).toBe(1)
    expect(useNodeStore().getConnections('root')).toHaveLength(1)
    const handles = nodeHandles()
    const pair = `N${handles.get(ids[0]!)}>N${handles.get(ids[1]!)}`
    const out2 = payload<{ removed: number }>(
      await runTool('aidea_connection_remove', { connectionIds: [pair] }, ctx),
    )
    expect(out2.removed).toBe(1)
    expect(useNodeStore().getConnections('root')).toHaveLength(0)
  })

  it('预设名未命中 → ToolError 附候选，不误写', async () => {
    const result = await runTool('aidea_node_create', { parentId: 'root', texts: ['X'], borderColor: '不存在的预设' }, ctx)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('unknown node preset')
    expect(useNodeStore().nodes.size).toBe(1) // 仅 root，未创建
  })
})
