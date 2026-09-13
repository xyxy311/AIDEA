/**
 * fsGuard.ts —— 文件系统访问防护的纯函数模块（不 import electron，可独立单测）。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §7（协议 traversal 防护）与 §3（目录名强校验）。
 * 架构红线 7：协议 handler 是唯一文件读取面——本模块是所有"物理路径解析"的守门人。
 *
 * 防护原则：
 * - 目录名 = pluginId，强校验 ^[a-z0-9_-]+$（协议 host 会被 Chromium 小写化，故只允许小写）。
 * - URL 相对路径必须先解码（decodeURIComponent），再 normalize + resolve，
 *   resolve 结果必须以插件目录的 resolve 前缀开头（含分隔符），否则拒绝。
 *   "含分隔符"是关键：否则 base=/x/plugin-a 会放行 /x/plugin-a2/...（前缀相似目录逃逸）。
 */
import path from 'node:path'

/** 插件目录名（= pluginId）强校验：仅小写字母/数字/下划线/连字符 */
const PLUGIN_DIR_NAME_RE = /^[a-z0-9_-]+$/

/** 判定目录名是否合法（不合法的子目录在扫描期直接跳过） */
export function isValidPluginDirName(name: string): boolean {
  return PLUGIN_DIR_NAME_RE.test(name)
}

/**
 * 协议 URL 的 pathname 解码（decodeURIComponent）。
 * URL 中路径段以百分号编码呈现（如 %2e%2e = ".."），必须在安全校验【前】解码，
 * 否则编码形态的 traversal（%2e%2e%2f）会绕过字面检查。
 * 解码失败（畸形 % 序列）返回 null，由调用方统一按 403 处理。
 */
export function decodeProtocolPath(rawPath: string): string | null {
  try {
    return decodeURIComponent(rawPath)
  } catch {
    return null
  }
}

/** resolveSafeFile 的结果：ok = 解析出的物理绝对路径；否则说明拒绝原因 */
export type SafeResolveResult =
  | { ok: true; filePath: string }
  | { ok: false; reason: 'empty' | 'escape' }

/**
 * 把"解码后的相对路径"解析为 baseDir 下的物理路径，全程做 traversal 防护。
 *
 * @param baseDir        允许访问的根目录（插件目录 / renderer dist 目录）
 * @param decodedRelPath 已解码的相对路径（通常来自 URL pathname，可能携带 ../ 等恶意内容）
 * @returns ok=true 时 filePath 是可安全读取的绝对路径；ok=false 时 reason：
 *          'empty' —— 空路径 / 仅斜杠 / 归一化后等于根目录本身（无具体文件）；
 *          'escape' —— 逃逸出 baseDir（../ 逃逸、绝对路径注入、前缀相似目录等）。
 */
export function resolveSafeFile(baseDir: string, decodedRelPath: string): SafeResolveResult {
  if (!decodedRelPath) return { ok: false, reason: 'empty' }
  // 仅斜杠 = 无具体文件（'' 的斜杠变体）
  if (/^[/\\]+$/.test(decodedRelPath)) return { ok: false, reason: 'empty' }
  // 以斜杠开头（根相对 /etc/passwd 或 UNC）一律拒绝：不做"驯化"，绝对路径注入语义上就应拒绝
  if (/^[/\\]/.test(decodedRelPath)) return { ok: false, reason: 'escape' }

  const rel = decodedRelPath

  // 绝对路径注入（Windows 盘符）：resolve(base, 'C:\x') 会直接采用后者，必须提前拒绝
  if (path.isAbsolute(rel)) return { ok: false, reason: 'escape' }

  // resolve 会同时完成 normalize（消化 ../、双斜杠、. 等）与大小写/分隔符归一
  const base = path.resolve(baseDir)
  const abs = path.resolve(base, rel)

  // 归一化后回到根目录本身（'.'、'a/..' 等）：视为空路径，无具体文件可服务
  if (abs === base) return { ok: false, reason: 'empty' }

  // 前缀校验必须"含分隔符"：否则 /x/plugin-a 会误放行 /x/plugin-a2/...（前缀相似目录逃逸）
  const prefix = base.endsWith(path.sep) ? base : base + path.sep
  if (!abs.startsWith(prefix)) return { ok: false, reason: 'escape' }

  return { ok: true, filePath: abs }
}
