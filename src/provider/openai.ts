/**
 * OpenAI 兼容 Provider - 调用本地 Ollama 大模型
 *
 * 通过 OpenAI 兼容端点（默认 http://localhost:11434/v1）发起 chat/completions 请求。
 * 纯函数式实现，便于单测。
 */
import type { AIProvider, AIProviderConfig, ChatMessage, ChatOptions } from './aiProvider'

/** AI 调用错误，带分级类型 */
export class AIError extends Error {
  constructor(
    public type: 'timeout' | 'network' | 'auth' | 'blocked' | 'http' | 'parse' | 'not-implemented',
    message: string,
    public status?: number,
  ) {
    super(message)
    this.name = 'AIError'
  }
}

/** 归一化 baseURL：去掉末尾 /，若非 /v1 结尾则拼接 /v1 */
function normalizeBaseURL(baseURL: string): string {
  let url = baseURL.trim()
  url = url.replace(/\/+$/, '')
  if (!/\/v1$/i.test(url)) {
    url = `${url}/v1`
  }
  return url
}

/** 网络错误（fetch 抛 TypeError）时重试一次，指数退避约 500ms */
const NETWORK_RETRY_DELAY_MS = 500

/** 构造请求头 */
function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

/** 解析非 2xx 响应为分级 AIError */
function buildHttpError(status: number, body: unknown): AIError {
  let message = `HTTP ${status}`
  const err = (body as Record<string, unknown>)?.error
  if (typeof err === 'string') message = err
  else if (err && typeof err === 'object') {
    const m = (err as Record<string, unknown>).message
    if (typeof m === 'string') message = m
  }
  if (status === 401 || status === 403) return new AIError('auth', message, status)
  return new AIError('http', message, status)
}

/** 创建 OpenAI 兼容 Provider */
export function createOpenAIProvider(config: AIProviderConfig): AIProvider {
  const baseURL = normalizeBaseURL(config.baseURL)

  return {
    async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
      // 预留流式分支：本次不实现
      if (opts.stream) {
        throw new AIError('not-implemented', '流式输出尚未实现')
      }

      const url = `${baseURL}/chat/completions`
      const body: Record<string, unknown> = { model: config.model, messages }
      if (opts.temperature !== undefined) body.temperature = opts.temperature
      if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens

      console.log(messages)

      const attempt = async (): Promise<Response> => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), config.timeoutMs)

        // 合并外部 signal 与内部超时 controller
        let externalAbortListener: (() => void) | null = null
        if (opts.signal) {
          if (typeof AbortSignal.any === 'function') {
            // 环境支持 AbortSignal.any：合并两个 signal
            const signals: AbortSignal[] = [controller.signal]
            if (opts.signal) signals.push(opts.signal)
            const combined = AbortSignal.any(signals)
            try {
              return await fetch(url, {
                method: 'POST',
                headers: buildHeaders(config.apiKey),
                body: JSON.stringify(body),
                signal: combined,
              })
            } finally {
              clearTimeout(timer)
            }
          } else {
            // 环境不支持 AbortSignal.any：手动监听外部 signal 转发 abort
            if (opts.signal.aborted) controller.abort()
            else {
              externalAbortListener = (): void => controller.abort()
              opts.signal.addEventListener('abort', externalAbortListener)
            }
            try {
              return await fetch(url, {
                method: 'POST',
                headers: buildHeaders(config.apiKey),
                body: JSON.stringify(body),
                signal: controller.signal,
              })
            } finally {
              clearTimeout(timer)
              if (externalAbortListener) opts.signal?.removeEventListener('abort', externalAbortListener)
            }
          }
        }

        // 无外部 signal
        try {
          return await fetch(url, {
            method: 'POST',
            headers: buildHeaders(config.apiKey),
            body: JSON.stringify(body),
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timer)
        }
      }

      let response: Response
      try {
        response = await attempt()
      } catch (err) {
        // 超时：abort 抛 AbortError
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new AIError('timeout', '请求超时')
        }
        // 网络错误：重试一次（指数退避约 500ms）
        await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS))
        try {
          response = await attempt()
        } catch (retryErr) {
          if (retryErr instanceof DOMException && retryErr.name === 'AbortError') {
            throw new AIError('timeout', '请求超时')
          }
          throw new AIError('network', (retryErr as Error).message ?? '网络错误')
        }
      }

      // 非 2xx：读 body.error 抛分级错误
      if (!response.ok) {
        let resBody: unknown
        try {
          resBody = await response.json()
        } catch {
          resBody = undefined
        }
        throw buildHttpError(response.status, resBody)
      }

      // 成功：解析 content
      let json: unknown
      try {
        json = await response.json()
      } catch {
        throw new AIError('parse', '响应解析失败')
      }
      const content = (json as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]
        ?.message?.content
      if (typeof content !== 'string') {
        throw new AIError('parse', '响应缺少有效 content')
      }
      return content
    },
  }
}