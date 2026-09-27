/**
 * pluginWatch.ts —— 插件目录 watch + 变更推送（IPC.CHANGED）。
 * 延续 pluginScan.ts 纯逻辑 + plugins.ts 接线的分工：纯函数（fingerprintInfo / diffPluginSnapshots / createDebouncer）可独立单测，
 * 薄接线层（startPluginWatching）负责 watch → debounce 重扫 → 快照比对 → webContents.send。
 * 指纹须含入口文件内容 hash：否则「同 id 仅改 plugin.js 内容」可见字段不变会漏报，renderer 收不到重载通知。
 */
import { watch } from 'chokidar'
import { BrowserWindow } from 'electron'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { DesktopPluginInfo } from '../shared/bridge'
import { IPC } from '../shared/bridge'
import { getPluginDir, pluginsRoot, rescan } from './plugins'
import { createDebouncer, diffSnapshots } from './watchUtils'

// ═══════════ 纯逻辑（纯函数；不触 electron / chokidar 运行时）═══════

/**
 * 单插件指纹：entry + manifest(固定键序 JSON.stringify) + error + 入口文件内容 hash；任一不同必得不同指纹。
 */
export function fingerprintInfo(info: DesktopPluginInfo, entryHash: string): string {
  return JSON.stringify({
    entry: info.entry,
    manifest: info.manifest,
    // error 为 undefined 时 JSON.stringify 会丢键，显式归一为 null 保持形状稳定
    error: info.error ?? null,
    entryHash,
  })
}

export { diffSnapshots as diffPluginSnapshots, createDebouncer } from './watchUtils'

// ═══════════ 薄接线层（import electron / chokidar / node:crypto / node:fs）═══════

/** debounce 窗口（ms）：一次保存动作常触发多个 watch 事件，窗口内合并为一次重扫比对 */
const DEBOUNCE_MS = 300

/** 入口文件读失败时的 hash 占位（归并不同失败形态，避免反复推送） */
const HASH_PLACEHOLDER = '?'

/** 入口文件内容 sha1；读失败返回占位并留痕，不让 watch 链路崩溃 */
function computeEntryHash(entryPath: string): string {
  try {
    return createHash('sha1').update(fs.readFileSync(entryPath, 'utf-8')).digest('hex')
  } catch (e) {
    console.error('[plugin] 入口文件内容 hash 计算失败：', entryPath, e)
    return HASH_PLACEHOLDER
  }
}

/** 用当前 rescan() 结果构建快照：id → 指纹 */
function buildSnapshot(): Map<string, string> {
  const snapshot = new Map<string, string>()
  for (const info of rescan()) {
    const dir = getPluginDir(info.id)
    snapshot.set(
      info.id,
      fingerprintInfo(info, dir ? computeEntryHash(path.join(dir, info.entry)) : HASH_PLACEHOLDER),
    )
  }
  return snapshot
}

/**
 * 启动插件目录 watch，返回 stop()。main/index.ts 在 app ready 后调用一次（当前不接管返回值，不做 will-quit 清理）。
 */
export function startPluginWatching(): () => void {
  // 生产首跑 userData/plugins 可能不存在，chokidar watch 不存在的根不可靠——先保证目录存在
  try {
    fs.mkdirSync(pluginsRoot(), { recursive: true })
  } catch (e) {
    // 建目录失败仍继续 watch（chokidar 的 error 事件兜底留痕）
    console.error('[plugin] 插件根目录创建失败：', pluginsRoot(), e)
  }

  // 基准快照：ignoreInitial 后初始事件不回，变更检测全靠与基准比对
  let lastSnapshot = buildSnapshot()

  // debounced 任务：重扫（白名单同步刷新）→ 重建快照 → diff → 非空才推送
  const rescanAndPush = (): void => {
    const next = buildSnapshot()
    const ids = diffSnapshots(lastSnapshot, next)
    lastSnapshot = next
    // diff 为空 = touch 等噪音：不推送（防误报）
    if (ids.length === 0) return
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.CHANGED, ids)
    }
    console.info('[plugin] 目录变更推送', ids)
  }

  const debounced = createDebouncer(DEBOUNCE_MS, rescanAndPush)

  const watcher = watch(pluginsRoot(), {
    // 基准快照已手动建立，初始扫描事件不算变更
    ignoreInitial: true,
    // depth 1 = 根(0) + 插件目录(1) 及其直接内容；更深层不监听（插件以目录直接内容为契约）
    depth: 1,
    // 等写入稳定再报事件，跳过半成品（编辑器/构建工具分步写入）
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  })
  // 增/改/删五类事件共用同一 debouncer：最终归并为「一次重扫比对」
  watcher.on('add', () => debounced.push())
  watcher.on('change', () => debounced.push())
  watcher.on('unlink', () => debounced.push())
  watcher.on('addDir', () => debounced.push())
  watcher.on('unlinkDir', () => debounced.push())
  // watch 出错只留痕，不让壳层崩溃
  watcher.on('error', (e) => console.error('[plugin] 插件目录 watch 出错：', e))

  return () => {
    debounced.cancel()
    void watcher.close()
  }
}
