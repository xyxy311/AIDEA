/**
 * i18nScan.ts —— 运行时 i18n 目录扫描的纯逻辑（不 import electron；IO 经 ScanIO 注入，可独立单测）。
 * 只读 *.json 语言文件：id = 文件名去 `.json`，逐一解析并校验 @meta（id 与文件名强一致），
 * 非法包静默跳过。扫描产出条目列表 + 白名单 Map（id → 绝对路径）。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { I18nFileInfo } from '../shared/bridge'
import { isValidI18nId, parseLanguageMeta } from '../shared/i18n'

/** 文件系统最小访问面（注入式设计：测试用内存 fake，主进程用 nodeScanIO） */
export interface I18nScanIO {
  /** 是否为已存在的目录 */
  isDirectory(p: string): boolean
  /** 列出目录直接子项 */
  listDirEntries(p: string): Array<{ name: string; isDirectory(): boolean }>
  /** 读文本文件（UTF-8） */
  readTextFile(p: string): string
}

/** node:fs 的 ScanIO 默认实现（仅 main 进程使用；测试传 fake） */
export const nodeScanIO: I18nScanIO = {
  isDirectory(p) {
    try {
      return fs.statSync(p).isDirectory()
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

/** 扫描产出：条目列表（renderer 可见）+ 白名单 Map（I18N_READ 访问控制） */
export interface I18nScanOutcome {
  infos: I18nFileInfo[]
  /** id → 语言文件绝对路径 */
  files: Map<string, string>
}

/**
 * 扫描运行时 i18n 根目录。纯函数（IO 注入）。
 * @param root 运行时 i18n 目录绝对路径（dev: <仓库根>/i18n-runtime；prod: userData/i18n）
 */
export function scanI18nFiles(root: string, io: I18nScanIO = nodeScanIO): I18nScanOutcome {
  const infos: I18nFileInfo[] = []
  const files = new Map<string, string>()

  if (!io.isDirectory(root)) return { infos, files }

  let entries: Array<{ name: string; isDirectory(): boolean }>
  try {
    entries = io.listDirEntries(root)
  } catch {
    // 根目录不可读（权限等）：降级为空结果，不让壳层崩溃
    return { infos, files }
  }

  for (const entry of entries) {
    if (entry.isDirectory()) continue
    const name = entry.name
    if (!name.endsWith('.json')) continue
    const id = name.slice(0, -'.json'.length)
    // id 非法（含文件名本身非规范语言 id）→ 跳过
    if (!isValidI18nId(id)) continue

    const filePath = path.join(root, name)
    let bundle: unknown
    try {
      bundle = JSON.parse(io.readTextFile(filePath))
    } catch {
      continue
    }
    if (typeof bundle !== 'object' || bundle === null || Array.isArray(bundle)) continue

    // @meta 缺失/非法，或 meta.id 与文件名不一致 → 静默跳过（不进清单也不进白名单）
    const res = parseLanguageMeta(bundle as Record<string, unknown>, id)
    if (!res.ok) continue

    infos.push({ id, label: res.meta.label, naiveBase: res.meta.naiveBase })
    files.set(id, filePath)
  }

  // 输出按 id 字典序排序保证稳定性
  infos.sort((a, b) => a.id.localeCompare(b.id))
  return { infos, files }
}