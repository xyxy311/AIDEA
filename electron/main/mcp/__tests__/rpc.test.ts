// @vitest-environment node
// electron/main/mcp/__tests__/rpc.test.ts —— JSON-RPC / MCP 协议分派纯函数单测
import { describe, expect, it } from 'vitest'
import { handleRpcAsync, handleRpcMessage, handleRpcPayload, MCP_SUPPORTED_PROTOCOL_VERSIONS, type RpcCallContext } from '../rpc'

function makeCtx(overrides: Partial<RpcCallContext> = {}): RpcCallContext {
  return {
    serverInfo: { name: 'aidea', version: '0.1.0' },
    getTools: () => [
      { name: 'aidea_demo', title: 'demo', description: 'demo tool', inputSchema: { type: 'object' } },
    ],
    getResources: () => [{ uri: 'aidea://demo', name: 'demo', description: '', mimeType: 'text/plain' }],
    callTool: async () => ({ content: [{ type: 'text', text: '{"ok":true}' }] }),
    windowsList: () => [{ windowId: 1, focused: true, projectName: 'P', dirty: false, toolReady: true }],
    readResource: async () => [{ uri: 'aidea://demo', mimeType: 'text/plain', text: 'hello' }],
    defaultWindowId: () => 1,
    ...overrides,
  }
}

describe('handleRpcMessage（同步方法）', () => {
  it('initialize：客户端版本受支持则原样回显', () => {
    const res = handleRpcMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, makeCtx())
    expect(res).toMatchObject({ id: 1, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'aidea' } } })
  })

  it('initialize：未知版本回落服务端最新', () => {
    const res = handleRpcMessage({ jsonrpc: '2.0', id: 'a', method: 'initialize', params: { protocolVersion: '1999-01-01' } }, makeCtx())
    expect(res).toMatchObject({ result: { protocolVersion: MCP_SUPPORTED_PROTOCOL_VERSIONS[0] } })
  })

  it('ping 与 tools/list', () => {
    expect(handleRpcMessage({ jsonrpc: '2.0', id: 2, method: 'ping' }, makeCtx())).toEqual({ jsonrpc: '2.0', id: 2, result: {} })
    const res = handleRpcMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, makeCtx())
    expect(res).toMatchObject({ result: { tools: [{ name: 'aidea_demo' }] } })
  })

  it('未知方法 → -32601', () => {
    const res = handleRpcMessage({ jsonrpc: '2.0', id: 4, method: 'bogus' }, makeCtx())
    expect(res).toMatchObject({ error: { code: -32601 } })
  })

  it('notification（无 id）→ null 不应答', () => {
    expect(handleRpcMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, makeCtx())).toBeNull()
  })

  it('非对象 / 缺 method → -32600', () => {
    expect(handleRpcMessage('str', makeCtx())).toMatchObject({ error: { code: -32600 } })
    expect(handleRpcMessage({ jsonrpc: '2.0', id: 5 }, makeCtx())).toMatchObject({ error: { code: -32600 } })
  })
})

describe('handleRpcPayload（tools/call 转发与本地应答）', () => {
  it('tools/call 转发 renderer：windowId 剥离且入参不携带', async () => {
    let captured: { windowId: number | undefined; name: string; args: Record<string, unknown> } | null = null
    const ctx = makeCtx({
      callTool: async (windowId, name, args) => {
        captured = { windowId, name, args }
        return { content: [{ type: 'text', text: 'ok' }] }
      },
    })
    const res = await handleRpcPayload(
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'aidea_demo', arguments: { x: 1, windowId: 3 } } },
      ctx,
    )
    expect(res.status).toBe(200)
    expect(captured).toEqual({ windowId: 3, name: 'aidea_demo', args: { x: 1 } })
  })

  it('未知工具 → -32602', async () => {
    const res = await handleRpcPayload(
      { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'aidea_nope' } },
      makeCtx(),
    )
    expect(res.body).toMatchObject({ error: { code: -32602 } })
  })

  it('aidea_windows_list 本地应答（不转发）', async () => {
    let called = false
    const ctx = makeCtx({ callTool: async () => { called = true; return { content: [] } } })
    const res = await handleRpcPayload(
      { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'aidea_windows_list' } },
      ctx,
    )
    expect(called).toBe(false)
    expect(res.body).toMatchObject({ result: { content: [{ type: 'text' }] } })
    expect(JSON.parse((res.body as { result: { content: Array<{ text: string }> } }).result.content[0].text)).toEqual({
      windows: [{ windowId: 1, focused: true, projectName: 'P', dirty: false, toolReady: true }],
    })
  })

  it('callTool 抛错 → isError:true 单行文本（不抛 500）', async () => {
    const ctx = makeCtx({ callTool: async () => { throw new Error('boom') } })
    const res = await handleRpcPayload(
      { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'aidea_demo' } },
      ctx,
    )
    expect(res.body).toMatchObject({ result: { isError: true, content: [{ type: 'text', text: 'boom' }] } })
  })

  it('windowId 非整数 → -32602', async () => {
    const res = await handleRpcPayload(
      { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'aidea_demo', arguments: { windowId: 'x' } } },
      makeCtx(),
    )
    expect(res.body).toMatchObject({ error: { code: -32602 } })
  })
})

describe('handleRpcPayload（resources）', () => {
  it('resources/list 返回清单', async () => {
    const res = await handleRpcPayload({ jsonrpc: '2.0', id: 12, method: 'resources/list' }, makeCtx())
    expect(res.body).toMatchObject({ result: { resources: [{ uri: 'aidea://demo' }] } })
  })

  it('resources/read 转发并包装 contents', async () => {
    const res = await handleRpcPayload(
      { jsonrpc: '2.0', id: 13, method: 'resources/read', params: { uri: 'aidea://demo' } },
      makeCtx(),
    )
    expect(res.body).toMatchObject({ result: { contents: [{ uri: 'aidea://demo', text: 'hello' }] } })
  })

  it('未知 resource → -32602', async () => {
    const res = await handleRpcPayload(
      { jsonrpc: '2.0', id: 14, method: 'resources/read', params: { uri: 'aidea://nope' } },
      makeCtx(),
    )
    expect(res.body).toMatchObject({ error: { code: -32602 } })
  })
})

describe('handleRpcPayload（batch 与 notification）', () => {
  it('batch 数组：逐条应答；纯 notification → 202', async () => {
    const ctx = makeCtx()
    const res = await handleRpcPayload(
      [
        { jsonrpc: '2.0', id: 15, method: 'ping' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
      ],
      ctx,
    )
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)

    const res202 = await handleRpcPayload([{ jsonrpc: '2.0', method: 'notifications/initialized' }], ctx)
    expect(res202).toEqual({ status: 202, body: null })
  })

  it('notification 对象 → 202 无体', async () => {
    const res = await handleRpcPayload({ jsonrpc: '2.0', method: 'notifications/initialized' }, makeCtx())
    expect(res).toEqual({ status: 202, body: null })
  })

  it('空 batch → 400', async () => {
    expect((await handleRpcPayload([], makeCtx())).status).toBe(400)
  })
})

describe('handleRpcAsync（直接分派）', () => {
  it('非白名单方法 → -32601', async () => {
    const res = await handleRpcAsync('bogus', {}, 16, makeCtx())
    expect(res).toMatchObject({ error: { code: -32601 } })
  })
})
