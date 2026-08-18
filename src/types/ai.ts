/**
 * AI 提示词 / 模式配置（项目级数据，随项目文件序列化）。
 *
 * 分为全局默认配置（defaultConfig，project store 持有）与
 * 按节点覆盖配置（nodeAIConfigs，project store 持有）。
 */
export interface AIConfig {
  /** 局部提示词（跟随观察节点） */
  localPrompt: string
  /** 快速 / 精确（精确 = 二段式连词成句） */
  mode: 'fast' | 'precise'
  /** 生成上下文时选用的 viewText 算法 id，默认 'collectAll' */
  viewTextAlgoId: string
}

/** AI 发散方向（用户可配置，标题 + 提示词） */
export interface AIDivergenceDirection {
  /** 唯一 id */
  id: string
  /** 展示标题（如「为什么？」） */
  title: string
  /** 该发散角度指令：拼入 user 指令段，可内嵌 ${from} 引用发散起点 */
  prompt: string
  /** 多节点发散起点合并成 fromText 时的分隔符（默认 ' '） */
  separator?: string
}