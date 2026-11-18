/**
 * mcp/config.ts —— userData/mcp.json 读写 + 默认值 + token 生成 + 补丁校验。
 * 不 import electron（userData 路径由调用方注入），纯 Node 可单测。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { McpConfig, McpConfigPatch, McpLimitsConfig } from '../../shared/bridge'

/** 配置文件名（位于 userData 目录） */
export const MCP_CONFIG_FILENAME = 'mcp.json'

/** 默认端口（占用即报错，不静默换端口） */
export const MCP_DEFAULT_PORT = 9876

/** 护栏上限默认值（§7 安全模型） */
export const MCP_DEFAULT_LIMITS: McpLimitsConfig = {
  maxOpsPerBatch: 100,
  maxNodesPerCreate: 200,
  maxDeletesPerCall: 200,
  toolTimeoutMs: 60_000,
  maxConcurrent: 4,
  maxCallsPerMinute: 120,
}

/** limits 各字段的合法区间（防用户手改配置文件塞进离谱值） */
const LIMIT_BOUNDS: Record<keyof McpLimitsConfig, { min: number; max: number }> = {
  maxOpsPerBatch: { min: 1, max: 1000 },
  maxNodesPerCreate: { min: 1, max: 5000 },
  maxDeletesPerCall: { min: 1, max: 5000 },
  toolTimeoutMs: { min: 1000, max: 600_000 },
  maxConcurrent: { min: 1, max: 64 },
  maxCallsPerMinute: { min: 1, max: 10_000 },
}

const PORT_MIN = 1024
const PORT_MAX = 65535

/** 生成 Bearer token：32 字节随机数 base64url（≈43 字符，URL 安全） */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** 默认配置：总开关默认关；token 首次生成后随文件持久化 */
export function defaultConfig(): McpConfig {
  return {
    enabled: false,
    port: MCP_DEFAULT_PORT,
    token: generateToken(),
    limits: { ...MCP_DEFAULT_LIMITS },
  }
}

/** 正整数收敛到 [min,max]，非有限数字用 fallback */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** 防御性归一：任何来源的原始对象 → 合法 McpConfig（缺省补默认、越界收敛、类型不符丢弃） */
export function normalizeConfig(raw: unknown): McpConfig {
  const fallback = defaultConfig()
  if (typeof raw !== 'object' || raw === null) return fallback
  const obj = raw as Record<string, unknown>
  const limitsRaw = (typeof obj.limits === 'object' && obj.limits !== null ? obj.limits : {}) as Record<string, unknown>
  const limits = {} as McpLimitsConfig
  for (const key of Object.keys(MCP_DEFAULT_LIMITS) as Array<keyof McpLimitsConfig>) {
    const bound = LIMIT_BOUNDS[key]
    limits[key] = clampInt(limitsRaw[key], bound.min, bound.max, MCP_DEFAULT_LIMITS[key])
  }
  const port = obj.port !== undefined && typeof obj.port === 'number' && Number.isInteger(obj.port) && obj.port >= PORT_MIN && obj.port <= PORT_MAX
    ? obj.port
    : MCP_DEFAULT_PORT
  const token = typeof obj.token === 'string' && obj.token.length >= 16 ? obj.token : generateToken()
  return { enabled: obj.enabled === true, port, token, limits }
}

/** applyPatch 的结果：ok=false 时 error 说明原因，config 原样返回 */
export type PatchResult =
  | { ok: true; config: McpConfig }
  | { ok: false; error: string }

/** 应用增量补丁（纯函数）：字段存在才更新，越界/非法直接报错（不静默收敛，设置面板可见原因） */
export function applyPatch(prev: McpConfig, patch: McpConfigPatch): PatchResult {
  const next: McpConfig = {
    enabled: prev.enabled,
    port: prev.port,
    token: prev.token,
    limits: { ...prev.limits },
  }
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== 'boolean') return { ok: false, error: 'enabled must be a boolean' }
    next.enabled = patch.enabled
  }
  if (patch.port !== undefined) {
    if (typeof patch.port !== 'number' || !Number.isInteger(patch.port) || patch.port < PORT_MIN || patch.port > PORT_MAX) {
      return { ok: false, error: `port must be an integer in [${PORT_MIN}, ${PORT_MAX}]` }
    }
    next.port = patch.port
  }
  if (patch.regenerateToken === true) {
    next.token = generateToken()
  } else if (patch.token !== undefined) {
    if (typeof patch.token !== 'string' || patch.token.length < 16) {
      return { ok: false, error: 'token must be a string of at least 16 characters' }
    }
    next.token = patch.token
  }
  if (patch.limits !== undefined) {
    if (typeof patch.limits !== 'object' || patch.limits === null) {
      return { ok: false, error: 'limits must be an object' }
    }
    for (const key of Object.keys(MCP_DEFAULT_LIMITS) as Array<keyof McpLimitsConfig>) {
      const value = patch.limits[key]
      if (value === undefined) continue
      const bound = LIMIT_BOUNDS[key]
      if (typeof value !== 'number' || !Number.isInteger(value) || value < bound.min || value > bound.max) {
        return { ok: false, error: `limits.${key} must be an integer in [${bound.min}, ${bound.max}]` }
      }
      next.limits[key] = value
    }
  }
  return { ok: true, config: next }
}

/** 配置文件绝对路径 */
export function configFilePath(dir: string): string {
  return path.join(dir, MCP_CONFIG_FILENAME)
}

/** 读取配置；文件缺失/损坏 → 默认配置（并回写一次，保证 token 落盘） */
export async function readConfig(dir: string): Promise<McpConfig> {
  try {
    const content = await fs.readFile(configFilePath(dir), 'utf8')
    return normalizeConfig(JSON.parse(content))
  } catch {
    const config = defaultConfig()
    await writeConfig(dir, config).catch(() => {})
    return config
  }
}

/** 写入配置（原子性要求不高：单文件小 JSON，直接写） */
export async function writeConfig(dir: string, config: McpConfig): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(configFilePath(dir), JSON.stringify(config, null, 2), 'utf8')
}
