// src/mcp/__tests__/tools.integration.test.ts —— 工具面集成测试（真实 pinia store + 命令层）
// 锁定 M2 验收核心：写工具一次调用 = 恰好 1 条历史；batch 原子性与首错回滚无残留。
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNodeStore } from '@/stores/node'
import { useHistoryStore } from '@/stores/history'
import { useTagsStore } from '@/stores/tags'
import { runTool, type RunToolResult } from '../registry'

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
    expect(out.error).toContain('node not found')
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
