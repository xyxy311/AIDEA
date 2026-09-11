import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { createOpenAIProvider, AIError } from '../provider/openai'

/** 构造一个 OpenAI 兼容的成功响应 */
function okResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

/** 构造非 2xx 响应 */
function errorResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('createOpenAIProvider', () => {
  const baseConfig = {
    baseURL: 'http://localhost:11434/v1',
    apiKey: '',
    model: 'qwen2.5-coder:7b',
    timeoutMs: 5000,
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('成功请求：拼接 URL、body 含 model/messages/temperature、返回 content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('你好，我是 AI'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAIProvider(baseConfig)
    const reply = await provider.chat(
      [{ role: 'user', content: '你好' }],
      { temperature: 0.7 },
    )

    expect(reply).toBe('你好，我是 AI')
    // 请求 URL 应为 baseURL + /chat/completions（baseURL 以 /v1 结尾时保留）
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('qwen2.5-coder:7b')
    expect(body.messages).toEqual([{ role: 'user', content: '你好' }])
    expect(body.temperature).toBe(0.7)
    expect(body.max_tokens).toBeUndefined()
  })

  it('baseURL 不带 /v1 时自动拼接', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAIProvider({ ...baseConfig, baseURL: 'http://localhost:11434' })
    await provider.chat([{ role: 'user', content: 'hi' }])

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
  })

  it('apiKey 存在时携带 Authorization: Bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAIProvider({ ...baseConfig, apiKey: 'secret' })
    await provider.chat([{ role: 'user', content: 'hi' }])

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer secret')
  })

  it('apiKey 为空时不带 Authorization 头', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAIProvider(baseConfig)
    await provider.chat([{ role: 'user', content: 'hi' }])

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('401 → AIError type===auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(401, { error: { message: '未授权' } }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAIProvider(baseConfig)
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      type: 'auth',
      status: 401,
    })
  })

  it('403 → AIError type===auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(403, { error: 'forbidden' }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAIProvider(baseConfig)
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      type: 'auth',
      status: 403,
    })
  })

  it('500 → AIError type===http', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(500, { error: { message: '服务器错误' } }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAIProvider(baseConfig)
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      type: 'http',
      status: 500,
    })
  })

  it('网络错误自动重试 1 次：首次 reject，第二次 resolve，最终成功', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(okResponse('重试成功'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAIProvider(baseConfig)
    const reply = await provider.chat([{ role: 'user', content: 'hi' }])

    expect(reply).toBe('重试成功')
    // 重试 1 次 = 共 2 次调用
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('网络错误重试仍失败 → AIError type===network', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAIProvider({ ...baseConfig, timeoutMs: 100 })
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      type: 'network',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('响应缺 content → AIError type===parse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAIProvider(baseConfig)
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      type: 'parse',
    })
  })

  it('超时 → AIError type===timeout', async () => {
    vi.useFakeTimers()
    // fetch 永不 resolve，但监听 signal，abort 时以 AbortError reject
    const fetchMock = vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) return
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'))
          return
        }
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAIProvider({ ...baseConfig, timeoutMs: 1000 })

    const promise = provider.chat([{ role: 'user', content: 'hi' }])
    const assertion = expect(promise).rejects.toMatchObject({ type: 'timeout' })

    await vi.advanceTimersByTimeAsync(1200)

    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stream=true 预留分支 → AIError type===not-implemented', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const provider = createOpenAIProvider(baseConfig)
    await expect(provider.chat([{ role: 'user', content: 'hi' }], { stream: true })).rejects.toMatchObject({
      type: 'not-implemented',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AIError 实例属性完整', () => {
    const err = new AIError('auth', '未授权', 401)
    expect(err).toBeInstanceOf(Error)
    expect(err.type).toBe('auth')
    expect(err.message).toBe('未授权')
    expect(err.status).toBe(401)
    expect(err.name).toBe('AIError')
  })
})
