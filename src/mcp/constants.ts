/**
 * mcp/constants.ts —— MCP 工具面常量（与 electron/main/mcp/config.ts 的默认护栏一致；
 * renderer 侧校验以这里的值为准，main 侧网络护栏以其配置文件为准）。
 */

/** 工具名统一前缀 */
export const MCP_TOOL_PREFIX = 'aidea_'

/** 建节点/排布的默认间距（px） */
export const MCP_LAYOUT_GAP = 24

/** T0 outline 默认与上限 */
export const MCP_OUTLINE_DEFAULT_DEPTH = 3
export const MCP_OUTLINE_MAX_DEPTH = 10
export const MCP_OUTLINE_DEFAULT_LIMIT = 50
export const MCP_OUTLINE_MAX_LIMIT = 500
/** 全叶子退化时列出的叶子名个数 */
export const MCP_OUTLINE_LEAF_PREVIEW = 5

/** T2 链式视图读取默认与上限 */
export const MCP_CHAIN_DEFAULT_MAX_CHAINS = 40
export const MCP_CHAIN_MAX_CHAINS_CAP = 200
export const MCP_CHAIN_DEFAULT_UNLINKED_LIMIT = 20
export const MCP_CHAIN_LABEL_MAX = 40
/** includeLayout 行带段的节点上限 */
export const MCP_LAYOUT_MAX_NODES = 300

/** T4 搜索默认与上限 */
export const MCP_SEARCH_DEFAULT_LIMIT = 50
export const MCP_SEARCH_LIMIT_CAP = 200

/** 内置默认连线样式（四元组全等才省略边段样式名；与 src/constants/index.ts DEFAULT_* 一致） */
export const MCP_DEFAULT_CONN_STYLE = {
  lineStyle: 'solid',
  strokeWidth: 2,
  strokeColor: '#6b7280',
  directed: true,
} as const

/** 截图默认与上限（小图快查：图会留在上下文里） */
export const MCP_SCREENSHOT_DEFAULT_MAX_WIDTH = 1024
export const MCP_SCREENSHOT_MAX_WIDTH_CAP = 4000
/** 截图画布单边设备像素上限（Chromium canvas 尺寸限制，超过会渲染失败） */
export const MCP_SCREENSHOT_MAX_EDGE_PX = 16384

/** renderer 侧护栏（对应 limits 默认值；超限返回结构化错误） */
export const MCP_LIMITS = {
  maxOpsPerBatch: 100,
  maxNodesPerCreate: 200,
  maxDeletesPerCall: 200,
} as const

/** 内部伪工具名：resource 读取经同一调用通道转发 renderer */
export const MCP_RESOURCE_PSEUDO_TOOL = '__resource__'
