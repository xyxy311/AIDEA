/**
 * i18nWatch.ts —— 运行时 i18n 目录 watch + 变更推送（IPC.I18N_CHANGED）。
 * 仿 pluginWatch：watch → debounce 重扫 → 快照比对 → webContents.send。
 * 指纹含文件内容 hash：否则「同 id 仅改内容」可见字段不变会漏报，renderer 收不到热登记通知。
 */
import { watch } from 'chokidar'
import { BrowserWindow } from 'electron'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import type { I18nFileInfo } from '../shared/bridge'
import { IPC } from '../shared/bridge'
import { diffSnapshots, createDebouncer } from './watchUtils'
import { getI18nFile, i18nRoot, rescanI18n } from './i18n'

/** debounce 窗口（ms）：一次保存动作常触发多个 watch 事件，窗口内合并为一次重扫比对 */
const DEBOUNCE_MS = 300

/** 语言文件读失败时的 hash 占位（归并不同失败形态，避免反复推送） */
const HASH_PLACEHOLDER = '?'

/** 单语言指纹：label/naiveBase（@meta 可见字段）+ 文件内容 hash；任一不同必得不同指纹 */
export function fingerprintI18n(info: I18nFileInfo, contentHash: string): string {
  return JSON.stringify({ id: info.id, label: info.label, naiveBase: info.naiveBase, hash: contentHash })
}

/** 语言文件内容 sha1；读失败返回占位并留痕，不让 watch 链路崩溃 */
function computeContentHash(filePath: string): string {
  try {
    return createHash('sha1').update(fs.readFileSync(filePath, 'utf-8')).digest('hex')
  } catch (e) {
    console.error('[i18n] 语言文件内容 hash 计算失败：', filePath, e)
    return HASH_PLACEHOLDER
  }
}

/** 用当前 rescanI18n() 结果构建快照：id → 指纹 */
function buildSnapshot(): Map<string, string> {
  const snapshot = new Map<string, string>()
  for (const info of rescanI18n()) {
    const filePath = getI18nFile(info.id)
    snapshot.set(info.id, fingerprintI18n(info, filePath ? computeContentHash(filePath) : HASH_PLACEHOLDER))
  }
  return snapshot
}

/**
 * 启动运行时 i18n 目录 watch，返回 stop()。main/index.ts 在 app ready 后调用一次。
 */
export function startI18nWatching(): () => void {
  // 生产首跑 userData/i18n 可能不存在，chokidar watch 不存在的根不可靠——先保证目录存在
  try {
    fs.mkdirSync(i18nRoot(), { recursive: true })
  } catch (e) {
    console.error('[i18n] 运行时 i18n 根目录创建失败：', i18nRoot(), e)
  }

  // 基准快照：ignoreInitial 后初始事件不回，变更检测全靠与基准比对
  let lastSnapshot = buildSnapshot()

  // debounced 任务：重扫（白名单同步刷新）→ 重建快照 → diff → 非空才推送
  const rescanAndPush = (): void => {
    const next = buildSnapshot()
    const ids = diffSnapshots(lastSnapshot, next)
    lastSnapshot = next
    if (ids.length === 0) return
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.I18N_CHANGED, ids)
    }
    console.info('[i18n] 运行时 i18n 目录变更推送', ids)
  }

  const debounced = createDebouncer(DEBOUNCE_MS, rescanAndPush)

  const watcher = watch(i18nRoot(), {
    // 基准快照已手动建立，初始扫描事件不算变更
    ignoreInitial: true,
    // depth 0 = 只监听根目录直接内容（语言包以根下 *.json 为契约）
    depth: 0,
    // 等写入稳定再报事件，跳过半成品（编辑器/文件复制分步写入）
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  })
  // 增/改/删事件共用同一 debouncer：最终归并为「一次重扫比对」
  watcher.on('add', () => debounced.push())
  watcher.on('change', () => debounced.push())
  watcher.on('unlink', () => debounced.push())
  watcher.on('error', (e) => console.error('[i18n] 运行时 i18n 目录 watch 出错：', e))

  return () => {
    debounced.cancel()
    void watcher.close()
  }
}