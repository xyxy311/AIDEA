/**
 * pluginWatch.ts —— 插件目录 watch + 变更推送（M2）。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §3 / §9 与 M2 通道定义
 * （electron/shared/bridge.ts 的 IPC.CHANGED = 'plugins:changed'；preload 的订阅转发 M1 已就位）。
 *
 * 职责分离沿用 M1 风格（pluginScan.ts 纯逻辑 + plugins.ts 接线）：
 * - 纯逻辑（fingerprintInfo / diffPluginSnapshots / createDebouncer）为纯函数，
 *   不触 electron / chokidar 运行时，可独立单测（__tests__/pluginWatch.test.ts）；
 * - 薄接线层（startPluginWatching）import electron / chokidar / node:crypto / node:fs，
 *   只做组装：watch 目录 → debounce 重扫 → 快照比对 → webContents.send。
 *
 * 为什么指纹要含入口文件内容 hash：
 * DesktopPluginInfo 的可见字段只有 entry 文件名 / manifest / error。「同 id 插件仅修改
 * plugin.js 内容（代码更新，manifest 未动）」时这些字段全部不变，纯 ids/manifest 快照
 * 比对会漏报——renderer 永远收不到重载通知。入口内容 sha1 进入指纹后，「同 id 内容修改」
 * 同样表现为指纹变化，从而触发 IPC.CHANGED 推送。
 *
 * 防误报链路：chokidar 事件只 push debounce（300ms 内合并事件风暴）→ 重扫（复用
 * rescan，白名单同步刷新）→ 全量快照 diff → diff 为空（touch 等噪音、内容未变）不推送。
 */
import { watch } from 'chokidar'
import { BrowserWindow } from 'electron'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { DesktopPluginInfo } from '../shared/bridge'
import { IPC } from '../shared/bridge'
import { getPluginDir, pluginsRoot, rescan } from './plugins'

// ════════════════════════ 纯逻辑（纯函数；不触 electron / chokidar 运行时）═══════════════════════

/**
 * 单插件指纹：entry 文件名 + manifest 可见字段（JSON.stringify）+ error + 入口文件内容 hash。
 * 固定键序序列化保证「同输入同指纹」；entry / manifest / error / hash 任一不同必得不同指纹。
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

/**
 * 快照比对：返回变更 id 列表（增 / 删 / 指纹变）。
 * - before 有 after 无 = 删除；before 无 after 有 = 新增；两边都有但指纹不同 = 修改。
 * - 输入 Map 的值即 fingerprintInfo 的产物；本函数只做 Map 比对。
 * - 输出按 id 字典序排序，保证同输入集的输出顺序稳定（测试可断言、推送载荷可预期）。
 */
export function diffPluginSnapshots(before: Map<string, string>, after: Map<string, string>): string[] {
  const changed = new Set<string>()
  // 新增（before 无 → undefined）与修改（两边都有但指纹不同）在此一并捕获
  for (const [id, fp] of after) {
    if (before.get(id) !== fp) changed.add(id)
  }
  // 删除：before 有 after 无
  for (const id of before.keys()) {
    if (!after.has(id)) changed.add(id)
  }
  return [...changed].sort()
}

/**
 * 简易 debounce 工厂：ms 窗口内多次 push 只在最后一次 push 后 ms 执行一次 task。
 * - push 之间的间隔会重置窗口（每次 push 重新计时）；
 * - cancel() 取消未执行的任务，此后仍可重新 push。
 */
export function createDebouncer(ms: number, task: () => void): { push(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    push(): void {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        task()
      }, ms)
    },
    cancel(): void {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}

// ════════════════════════ 薄接线层（import electron / chokidar / node:crypto / node:fs）═══════════════════════

/** debounce 窗口（ms）：一次保存动作常触发多个 watch 事件，窗口内合并为一次重扫比对 */
const DEBOUNCE_MS = 300

/** 入口文件读失败时的 hash 占位（不同失败形态归并为同一占位，避免反复推送） */
const HASH_PLACEHOLDER = '?'

/** 入口文件内容的 sha1（读文件 utf-8）；读失败返回 '?' 占位并留痕，不让 watch 链路崩溃 */
function computeEntryHash(entryPath: string): string {
  try {
    return createHash('sha1').update(fs.readFileSync(entryPath, 'utf-8')).digest('hex')
  } catch (e) {
    console.error('[plugin] 入口文件内容 hash 计算失败：', entryPath, e)
    return HASH_PLACEHOLDER
  }
}

/** 用当前 rescan() 结果构建快照：id → 指纹（插件目录绝对路径取自 rescan 刚刷新的白名单） */
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
 * 启动插件目录 watch；返回 stop()（关闭 watcher 与 debounce）。
 * main/index.ts 在 app ready 后调用一次（当前调用方不接管返回值：不做 will-quit 清理，
 * 进程退出随 OS 回收，与 M1 的协议 handler 注册风格一致；stop 供将来需要时兜底）。
 */
export function startPluginWatching(): () => void {
  // 生产首跑 userData/plugins 可能不存在，chokidar watch 不存在的根不可靠——先保证目录存在
  try {
    fs.mkdirSync(pluginsRoot(), { recursive: true })
  } catch (e) {
    // 建目录失败仍继续 watch（chokidar 自身 error 事件会兜底留痕），不让壳层崩溃
    console.error('[plugin] 插件根目录创建失败：', pluginsRoot(), e)
  }

  // 基准快照：ignoreInitial 后 chokidar 不报初始事件，变更检测全部依赖与基准的比对
  let lastSnapshot = buildSnapshot()

  // debounced 任务：重扫（白名单同步刷新）→ 重建快照 → diff → 非空才推送
  const rescanAndPush = (): void => {
    const next = buildSnapshot()
    const ids = diffPluginSnapshots(lastSnapshot, next)
    lastSnapshot = next
    // diff 为空 = touch 后内容未变等噪音：不推送（这正是「重扫比对」防误报的意义）
    if (ids.length === 0) return
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.CHANGED, ids)
    }
    console.info('[plugin] 目录变更推送', ids)
  }

  const debounced = createDebouncer(DEBOUNCE_MS, rescanAndPush)

  const watcher = watch(pluginsRoot(), {
    // 基准快照已手动建立，初始扫描的事件不算变更
    ignoreInitial: true,
    // depth 1 = 根(0) + 插件目录(1) 及其直接内容（plugin.js / manifest.json）；
    // 插件目录更深层（depth ≥ 2）不监听——插件以目录直接内容为契约（蓝图 §6）
    depth: 1,
    // 等写入稳定再报事件，跳过半成品文件（编辑器/构建工具的分步写入）
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  })
  // 增 / 改 / 删（文件与目录）五类事件共用同一 debouncer：最终都归并为「一次重扫比对」
  watcher.on('add', () => debounced.push())
  watcher.on('change', () => debounced.push())
  watcher.on('unlink', () => debounced.push())
  watcher.on('addDir', () => debounced.push())
  watcher.on('unlinkDir', () => debounced.push())
  // watch 出错（根目录被删 / 权限等）只留痕，不让壳层崩溃
  watcher.on('error', (e) => console.error('[plugin] 插件目录 watch 出错：', e))

  return () => {
    debounced.cancel()
    void watcher.close()
  }
}
