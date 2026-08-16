import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { runSentenceMaking, runGenerateIdea } from '@/composables/useAIGenerate'
import { useAIConfigStore } from '@/stores/ai'
import { AI_SENTENCE_PROMPT, AI_WORD_PROMPT } from '@/constants/ai'

/** 构造 OpenAI 兼容成功响应 */
function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('useAIGenerate', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('runSentenceMaking：用 AI_SENTENCE_PROMPT 作 system，返回模型原始文本', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('目标包含两个子主题。'))
    vi.stubGlobal('fetch', fetchMock)

    const input = '目标\n  子1\n  子2'
    const reply = await runSentenceMaking(input)

    expect(reply).toBe('目标包含两个子主题。')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages).toEqual([
      { role: 'system', content: AI_SENTENCE_PROMPT },
      { role: 'user', content: input },
    ])
  })

  it('runGenerateIdea：用 AI_WORD_PROMPT 作 system，返回模型原始文本（不拆行）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('灵感词1\n灵感词2\n灵感词3'))
    vi.stubGlobal('fetch', fetchMock)

    const input = '目标\n  子1'
    const reply = await runGenerateIdea(input)

    // 原始文本原样返回，调用方负责拆行
    expect(reply).toBe('灵感词1\n灵感词2\n灵感词3')
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_WORD_PROMPT)
    expect(body.messages[1].content).toBe(input)
  })

  it('调用失败时错误向上抛出（不吞掉）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(runGenerateIdea('正文')).rejects.toBeInstanceOf(Error)
  })

  it('URL 使用当前 store 的 baseURL（含 /v1 归一化）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const store = useAIConfigStore()
    store.model = 'qwen2.5-coder:7b'

    await runGenerateIdea('正文')
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/v1/chat/completions')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.model).toBe('qwen2.5-coder:7b')
  })
})