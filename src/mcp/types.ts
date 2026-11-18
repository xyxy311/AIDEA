/**
 * mcp/types.ts —— MCP 工具面纯类型（renderer 侧单一数据源 registry.ts 的契约）。
 * 与 electron/shared/bridge.ts 的清单/回执类型解耦（渲染层不 import electron 侧路径）。
 */

/** 最小 JSON Schema（工具入参校验面：type/properties/required/enum/items/数值与数组边界） */
export type McpSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'

export interface McpJsonSchema {
  type?: McpSchemaType | McpSchemaType[]
  properties?: Record<string, McpJsonSchema>
  required?: string[]
  items?: McpJsonSchema
  enum?: Array<string | number | boolean | null>
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  additionalProperties?: boolean
  description?: string
}

/** 工具风险分级（护栏与文档用）：read 只读 / write 可撤销写 / danger 破坏性写 */
export type McpToolRisk = 'read' | 'write' | 'danger'

/** 工具执行上下文（registry handler 入参） */
export interface McpToolContext {
  /** 已在 aidea_batch 事务内：handler 跳过自身的 beginBatch/commitBatch */
  inBatch: boolean
}

/** 工具 handler 输出：json 载荷（host 包 content text）或 image（截图）；isError 用于结构化失败（如 batch 首错回滚） */
export type McpToolOutput =
  | { kind: 'json'; payload: unknown; isError?: boolean }
  | { kind: 'image'; data: string; mimeType: string }

/** 工具定义（登记表条目） */
export interface McpToolDef {
  /** 工具名（统一 aidea_ 前缀） */
  name: string
  /** 展示名 i18n key（设置面板工具清单经 t() 显示；MCP manifest 的 title 由 name 派生英文标签） */
  title: string
  /** 英文描述（模型侧契约，含安全指引） */
  description: string
  inputSchema: McpJsonSchema
  risk: McpToolRisk
  /** undefined = main 本地应答工具（如 windows_list），不进入 renderer 执行 */
  handler?: (args: Record<string, unknown>, ctx: McpToolContext) => Promise<McpToolOutput> | McpToolOutput
}

/** resource 定义（同步按需生成） */
export interface McpResourceDef {
  uri: string
  name: string
  description: string
  mimeType: string
  /** 返回 (text, mimeType)；handler 内读 store 生成内容 */
  read: () => Promise<{ mimeType: string; text: string }> | { mimeType: string; text: string }
}
