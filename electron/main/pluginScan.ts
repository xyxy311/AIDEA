/**
 * pluginScan.ts —— 本地插件目录扫描的纯逻辑（不 import electron；IO 经 ScanIO 注入，可独立单测）。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §3（main 职责：扫描）与 §6（目录插件规格 v1）。
 *
 * 扫描规则（零代码执行：只读目录名 / manifest.json / 入口文件存在性，绝不 import 插件代码）：
 * - 插件根下每个【子目录】视为候选插件；目录名 = pluginId，强校验 ^[a-z0-9_-]+$，不合法 → 跳过；
 * - 入口判定优先级 plugin.js > index.js > index.mjs；无入口 → 跳过（不产出条目）；
 * - manifest.json 可选：JSON.parse 失败或字段不符 → 条目携带 error 说明，但不中断扫描；
 * - 目录不存在 → 返回空结果。
 *
 * 产出同时包含白名单 Map（id → 插件目录绝对路径），供协议 handler 做访问控制：
 * 仅出现在白名单中的 id 才允许经 aidea-plugin:// 协议读取文件。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { DesktopPluginInfo, PluginManifestJSON } from '../shared/bridge'
import { isValidPluginDirName } from './fsGuard'

/** 入口文件判定优先级（从高到低） */
export const ENTRY_CANDIDATES = ['plugin.js', 'index.js', 'index.mjs'] as const

/** manifest.json 的固定文件名 */
export const MANIFEST_FILENAME = 'manifest.json'

/** 文件系统最小访问面（注入式设计：测试用内存 fake 替换，主进程用 nodeScanIO） */
export interface ScanIO {
  /** 路径是否为已存在的目录 */
  isDirectory(p: string): boolean
  /** 路径是否为已存在的普通文件 */
  isFile(p: string): boolean
  /** 列出目录的直接子项（name + 是否目录） */
  listDirEntries(p: string): Array<{ name: string; isDirectory(): boolean }>
  /** 读取文本文件（UTF-8）；不存在/不可读时抛错 */
  readTextFile(p: string): string
}

/** node:fs 的 ScanIO 默认实现（仅 main 进程使用；测试传 fake） */
export const nodeScanIO: ScanIO = {
  isDirectory(p) {
    try {
      return fs.statSync(p).isDirectory()
    } catch {
      return false
    }
  },
  isFile(p) {
    try {
      return fs.statSync(p).isFile()
    } catch {
      return false
    }
  },
  listDirEntries(p) {
    return fs.readdirSync(p, { withFileTypes: true })
  },
  readTextFile(p) {
    return fs.readFileSync(p, 'utf-8')
  },
}

/** 扫描产出：条目列表（renderer 可见）+ 白名单 Map（协议 handler 访问控制） */
export interface ScanOutcome {
  infos: DesktopPluginInfo[]
  /** id → 插件目录绝对路径（含带 error 的条目：文件服务授权与"装载层跳过 error 条目"是两回事） */
  dirs: Map<string, string>
}

/**
 * 扫描插件根目录。纯函数（IO 注入），不做任何代码执行。
 * @param root 插件根目录绝对路径（dev: <仓库根>/plugins；prod: userData/plugins）
 */
export function scanPluginDirectories(root: string, io: ScanIO = nodeScanIO): ScanOutcome {
  const infos: DesktopPluginInfo[] = []
  const dirs = new Map<string, string>()

  // 目录不存在（或不是目录）→ 空结果
  if (!io.isDirectory(root)) return { infos, dirs }

  let entries: Array<{ name: string; isDirectory(): boolean }>
  try {
    entries = io.listDirEntries(root)
  } catch {
    // 根目录不可读（权限等）：降级为空结果，不让壳层崩溃
    return { infos, dirs }
  }

  for (const entry of entries) {
    // 只看子目录；普通文件（README 之类）直接忽略
    if (!entry.isDirectory()) continue
    const id = entry.name
    // 目录名强校验：不合法 → 跳过（不产出条目，也不进白名单）
    if (!isValidPluginDirName(id)) continue

    const dir = path.join(root, id)

    // 入口判定：按优先级找第一个存在的入口文件；无入口 → 跳过
    const entryFile = ENTRY_CANDIDATES.find((name) => io.isFile(path.join(dir, name)))
    if (!entryFile) continue

    // manifest.json 可选：解析/校验失败 → 条目带 error 但不中断
    let manifest: PluginManifestJSON | null = null
    let error: string | undefined
    const manifestPath = path.join(dir, MANIFEST_FILENAME)
    if (io.isFile(manifestPath)) {
      try {
        const raw: unknown = JSON.parse(io.readTextFile(manifestPath))
        manifest = validateManifestJson(raw)
      } catch (e) {
        manifest = null
        error = e instanceof Error ? `manifest.json 无效：${e.message}` : `manifest.json 无效：${String(e)}`
      }
    }

    infos.push(error === undefined ? { id, entry: entryFile, manifest } : { id, entry: entryFile, manifest, error })
    dirs.set(id, dir)
  }

  return { infos, dirs }
}

/**
 * manifest.json 结构校验（对齐 shared/bridge.ts 的 PluginManifestJSON）：
 * id/name/version/sdkVersion 必填非空 string；description/author 可选 string。
 * 不符则抛错（中文信息，会进入 DesktopPluginInfo.error 供 UI 展示）。
 * 只返回已知字段（多余字段一律丢弃，避免任意内容透传到 renderer）。
 */
export function validateManifestJson(raw: unknown): PluginManifestJSON {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('清单须为 JSON 对象')
  }
  const o = raw as Record<string, unknown>

  const required: Array<keyof Pick<PluginManifestJSON, 'id' | 'name' | 'version' | 'sdkVersion'>> = [
    'id',
    'name',
    'version',
    'sdkVersion',
  ]
  for (const key of required) {
    const v = o[key]
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(`字段 ${key} 须为非空字符串`)
    }
  }
  for (const key of ['description', 'author'] as const) {
    const v = o[key]
    if (v !== undefined && typeof v !== 'string') {
      throw new Error(`字段 ${key} 须为字符串`)
    }
  }

  const result: PluginManifestJSON = {
    id: o.id as string,
    name: o.name as string,
    version: o.version as string,
    sdkVersion: o.sdkVersion as string,
  }
  if (typeof o.description === 'string') result.description = o.description
  if (typeof o.author === 'string') result.author = o.author
  return result
}
