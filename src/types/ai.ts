/**
 * AI 提示词 / 模式配置（项目级数据，随项目文件序列化）。
 *
 * 分为全局默认配置（defaultConfig，project store 持有）与
 * 按节点覆盖配置（nodeAIConfigs，project store 持有）。
 */
export interface AIConfig {
  /** 局部提示词（跟随观察节点） */
  localPrompt: string
  /** true→buildNodeContext（带连线）；false→viewText 空间算法 */
  includeConnections: boolean
  /** 快速 / 精确（精确 = 二段式连词成句） */
  mode: 'fast' | 'precise'
  /** includeConnections=false 时选用的 viewText 算法 id，默认 'collectAll' */
  viewTextAlgoId: string
}