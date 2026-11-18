/**
 * mcp/constants.ts —— MCP 工具面常量（与 electron/main/mcp/config.ts 的默认护栏一致；
 * renderer 侧校验以这里的值为准，main 侧网络护栏以其配置文件为准）。
 */

/** 工具名统一前缀 */
export const MCP_TOOL_PREFIX = 'aidea_'

/** 建节点/排布的默认间距（px） */
export const MCP_LAYOUT_GAP = 24

/** T2 视图读取默认与上限 */
export const MCP_VIEW_READ_DEFAULT_MAX_NODES = 300
export const MCP_VIEW_READ_MAX_NODES_CAP = 2000

/** T4 搜索默认与上限 */
export const MCP_SEARCH_DEFAULT_LIMIT = 50
export const MCP_SEARCH_LIMIT_CAP = 200

/** 截图默认与上限 */
export const MCP_SCREENSHOT_DEFAULT_MAX_WIDTH = 1600
export const MCP_SCREENSHOT_MAX_WIDTH_CAP = 4000

/** renderer 侧护栏（对应 limits 默认值；超限返回结构化错误） */
export const MCP_LIMITS = {
  maxOpsPerBatch: 100,
  maxNodesPerCreate: 200,
  maxDeletesPerCall: 200,
} as const

/** 内部伪工具名：resource 读取经同一调用通道转发 renderer */
export const MCP_RESOURCE_PSEUDO_TOOL = '__resource__'
