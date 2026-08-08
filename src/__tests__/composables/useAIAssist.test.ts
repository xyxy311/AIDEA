import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useAIConfigStore } from '@/stores/ai'
import { runAIAssist } from '@/composables/useAIAssist'

/** 构造 OpenAI 兼容成功响应 */
function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('runAIAssist', () => {
  let nodeStore: ReturnType<typeof useNodeStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    nodeStore = useNodeStore()
    nodeStore.getNode(ROOT_NODE_ID)!.text = '我的项目'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('成功调用：system + user（含节点文本）两段消息，打印并返回回复', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('发散建议'))
    vi.stubGlobal('fetch', fetchMock)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // 构造节点树：根 → 目标(含子级)
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '头脑主题')
    nodeStore.addNode(target, 0, 0, '子想法')

    const reply = await runAIAssist(target)

    expect(reply).toBe('发散建议')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    const body = JSON.parse(init.body as string)
    expect(body.messages.length).toBe(2)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1].role).toBe('user')
    expect(body.messages[1].content).toContain('头脑主题')
    expect(body.messages[1].content).toContain('子想法')

    // console.log 打印了回复
    expect(logSpy).toHaveBeenCalledWith('[AI 回复]', '发散建议')
  })

  it('缺省 targetNodeId 时用当前查看节点（project.currentNodeId）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '默认目标')

    // 未传 targetNodeId → 使用 project.currentNodeId（主视图 viewedNodeId）
    await runAIAssist()

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[1].content).toContain('默认目标')
  })

  it('调用失败时打印错误并 re-throw', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '主题')

    await expect(runAIAssist(target)).rejects.toBeInstanceOf(Error)
    expect(errorSpy).toHaveBeenCalledWith('[AI 调用失败]', expect.any(Error))
  })

  it('上下文为空时空字符串并打印警告，不调用 fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const reply = await runAIAssist('not-exist')

    expect(reply).toBe('')
    expect(warnSpy).toHaveBeenCalledWith('[AI] 当前视图上下文为空')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})