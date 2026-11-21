/**
 * mcp/registry.ts —— MCP 工具登记表（单一数据源）。
 * 启动时经 host.publishTools() 推给 main 缓存（tools/list 数据源）；执行统一走 runTool
 * （参数校验 → handler → 输出），host 与 aidea_batch 共用同一入口。
 */
import type { McpResourceDef, McpToolContext, McpToolDef, McpToolOutput } from './types'
import { validateArgs } from './schema'
import { BOARD_RESOURCES, BOARD_TOOLS } from './tools/board'
import { NODE_TOOLS } from './tools/node'
import { CONNECTION_TOOLS } from './tools/connection'
import { MISC_TOOLS } from './tools/misc'

/** 全量工具（22 个：T0–T21；aidea_windows_list 由 main 本地应答，handler 缺省） */
export const TOOLS: McpToolDef[] = [...BOARD_TOOLS, ...NODE_TOOLS, ...CONNECTION_TOOLS, ...MISC_TOOLS]

/** 全量 resource（3 个） */
export const RESOURCES: McpResourceDef[] = [...BOARD_RESOURCES]

/** 按名查工具 */
export function findTool(name: string): McpToolDef | undefined {
  return TOOLS.find((t) => t.name === name)
}

/** 按_uri 查 resource */
export function findResource(uri: string): McpResourceDef | undefined {
  return RESOURCES.find((r) => r.uri === uri)
}

/** 统一执行入口的结果：成功输出或结构化错误（不抛异常） */
export type RunToolResult =
  | { ok: true; output: McpToolOutput }
  | { ok: false; error: string }

/**
 * 校验参数并执行工具。参数校验失败 / 未知工具 / handler 抛错都归一为 ok:false（单行错误文本）。
 * 注意：本函数不做 batch 边界管理（handler 自理，或由 aidea_batch 包裹）。
 */
export async function runTool(name: string, args: Record<string, unknown>, ctx: McpToolContext): Promise<RunToolResult> {
  const tool = findTool(name)
  if (!tool || tool.handler === undefined) return { ok: false, error: `unknown tool: ${name}` }
  const check = validateArgs(args, tool.inputSchema)
  if (!check.ok) {
    const detail = check.issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('; ')
    return { ok: false, error: `invalid arguments for ${name} — ${detail}` }
  }
  try {
    return { ok: true, output: await tool.handler(args, ctx) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
