import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  runSentenceMaking,
  runGenerateIdea,
} from '@/composables/useAIGenerate'
import { useAIConfigStore } from '@/stores/ai'
import {
  AI_SENTENCE_PROMPT,
  AI_GENERATE_IDEA_NODE,
  AI_GENERATE_IDEA_DESCRIPTION,
  AI_DIRECTION_ANY,
  AI_DIRECTION_FOCUS,
  DEFAULT_AI_DIRECTIONS,
} from '@/constants/ai'
import type { AIDivergenceDirection } from '@/types/ai'

/** 构造 OpenAI 兼容成功响应 */
function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 构造一个发散方向（prompt 内嵌 ${from}） */
function dirWithFrom(overrides: Partial<AIDivergenceDirection> = {}): AIDivergenceDirection {
  return {
    id: 'd1',
    title: '为什么？',
    prompt: '请围绕「${from}」从「为什么」的角度发散灵感。',
    separator: ' ',
    ...overrides,
  }
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

  it('isDescription=false：system 用 AI_GENERATE_IDEA_NODE，user 含 # 上下文/# 指令、指令为任意发散 prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('灵感词1\n灵感词2'))
    vi.stubGlobal('fetch', fetchMock)

    const reply = await runGenerateIdea({
      text: '目标\n  子1',
      isDescription: false,
      direction: AI_DIRECTION_ANY,
    })

    expect(reply).toBe('灵感词1\n灵感词2')
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_GENERATE_IDEA_NODE)
    expect(body.messages[1].content).toContain('# 上下文\n目标\n  子1')
    expect(body.messages[1].content).toContain('# 指令')
    // 任意发散：指令为其 prompt（基于上方上下文发散）
    expect(body.messages[1].content).toContain(AI_DIRECTION_ANY.prompt)
  })

  it('isDescription=true：system 用 AI_GENERATE_IDEA_DESCRIPTION', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('词'))
    vi.stubGlobal('fetch', fetchMock)

    await runGenerateIdea({
      text: '一段连贯描述。',
      isDescription: true,
      direction: AI_DIRECTION_ANY,
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_GENERATE_IDEA_DESCRIPTION)
  })

  it('direction 存在：${from} 被替换为 fromText，from 数组用 separator join', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('词'))
    vi.stubGlobal('fetch', fetchMock)

    const direction = dirWithFrom()
    await runGenerateIdea({
      text: '目标\n  子1',
      isDescription: false,
      from: ['起点A', '起点B'],
      direction,
      addition: '全局提示：请多角度',
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    const user = body.messages[1].content as string
    expect(user).toContain('# 上下文')
    expect(user).toContain('# 指令')
    expect(user).toContain('# 补充')
    // ${from} 被替换为分隔符 join 后的 fromText
    expect(user).toContain('请围绕「起点A 起点B」从「为什么」的角度发散灵感。')
    expect(user).not.toContain('${from}')
    expect(user).toContain('全局提示：请多角度')
  })

  it('direction 为 AI_DIRECTION_FOCUS：围绕 fromText 聚焦发散', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('词'))
    vi.stubGlobal('fetch', fetchMock)

    await runGenerateIdea({
      text: '目标',
      isDescription: false,
      from: ['起点'],
      direction: AI_DIRECTION_FOCUS,
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[1].content).toContain('请围绕「起点」发散灵感，生成一些能帮助用户思考的灵感词或短句。')
  })

  it('direction.prompt 不含 ${from}：from 被忽略，不注入起点', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('词'))
    vi.stubGlobal('fetch', fetchMock)

    const direction: AIDivergenceDirection = {
      id: 'd2',
      title: '空',
      prompt: '仅围绕「为什么」角度发散。',
      separator: ' ',
    }
    await runGenerateIdea({ text: '目标', isDescription: false, from: ['起点'], direction })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[1].content).toContain('仅围绕「为什么」角度发散。')
    expect(body.messages[1].content).not.toContain('起点')
    expect(body.messages[1].content).not.toContain('发散起点')
  })

  it('addition 为空串：user 不含 # 补充 段', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('词'))
    vi.stubGlobal('fetch', fetchMock)

    await runGenerateIdea({ text: '目标', isDescription: false, addition: '', direction: AI_DIRECTION_ANY })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[1].content).not.toContain('# 补充')
  })

  it('调用失败时错误向上抛出（不吞掉）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(runGenerateIdea({ text: '正文', isDescription: false, direction: AI_DIRECTION_ANY })).rejects.toBeInstanceOf(Error)
  })

  it('URL 使用当前 store 的 baseURL（含 /v1 归一化）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const store = useAIConfigStore()
    store.model = 'qwen2.5-coder:7b'

    await runGenerateIdea({ text: '正文', isDescription: false, direction: AI_DIRECTION_ANY })
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/v1/chat/completions')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.model).toBe('qwen2.5-coder:7b')
  })

  it('text 与 from 都为空时抛普通 Error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('灵感'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runGenerateIdea({ text: '', isDescription: false, from: [], direction: AI_DIRECTION_ANY })).rejects.toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('DEFAULT_AI_DIRECTIONS：前两项引用特殊方向常量，各方向带 separator、具体角度与聚焦含 ${from}', () => {
    // 前两项引用特殊方向常量（复用其 title/prompt/separator）
    expect(DEFAULT_AI_DIRECTIONS[0].title).toBe(AI_DIRECTION_ANY.title)
    expect(DEFAULT_AI_DIRECTIONS[0].prompt).toBe(AI_DIRECTION_ANY.prompt)
    expect(DEFAULT_AI_DIRECTIONS[1].title).toBe(AI_DIRECTION_FOCUS.title)
    expect(DEFAULT_AI_DIRECTIONS[1].prompt).toBe(AI_DIRECTION_FOCUS.prompt)
    // 各方向均带 separator
    DEFAULT_AI_DIRECTIONS.forEach((d) => {
      expect(d.separator).toBeDefined()
    })
    // 聚焦发散与具体角度方向内嵌 ${from}；任意发散除外
    expect(DEFAULT_AI_DIRECTIONS[1].prompt).toContain('${from}')
    DEFAULT_AI_DIRECTIONS.slice(2).forEach((d) => {
      expect(d.prompt).toContain('${from}')
    })
    // 任意发散不注入起点
    expect(DEFAULT_AI_DIRECTIONS[0].prompt).not.toContain('${from}')
  })
})