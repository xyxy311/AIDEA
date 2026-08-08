/**
 * AI Provider 纯类型定义
 *
 * 定义模型调用所需的最小接口，具体实现（如 OpenAI 兼容）见 openai.ts。
 */

/** 对话消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 对话选项 */
export interface ChatOptions {
  /** 外部取消信号（与内部超时合并） */
  signal?: AbortSignal
  /** 采样温度 */
  temperature?: number
  /** 最大输出 token 数 */
  maxTokens?: number
  /** 响应格式（预留） */
  responseFormat?: 'json_object' | undefined
  /** 是否流式（预留，首版恒 false） */
  stream?: boolean
}

/** Provider 配置 */
export interface AIProviderConfig {
  baseURL: string
  apiKey: string
  model: string
  timeoutMs: number
}

/** Provider 统一接口 */
export interface AIProvider {
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>
}