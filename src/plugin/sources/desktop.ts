/**
 * desktop.ts —— 桌面本地插件源（Electron 壳扫描插件目录）。
 * 全 renderer 唯一的 `window.aideaDesktop` 桥访问点（架构红线）：除本文件外 renderer 任何代码
 * 不得探测桌面桥；IPC 失败 → console.error + 空集兜底；`info.error` 非空条目被过滤。
 */
import type { DesktopPluginInfo } from '../../../electron/shared/bridge'
import type { PluginEntry } from '../manager'

// 全 renderer 唯一桥访问点：模块加载时读取一次（Electron preload 注入先于应用脚本）
const bridge = window.aideaDesktop

/**
 * 入口 URL 的运行时分支：dev server 伺服（location.protocol 为 http/https）下用
 * `/plugins/<id>/<entry>` 根相对 URL，可被 vite transform 且与宿主共享同一 SDK 模块实例；
 * 否则走 `aidea-plugin://` 协议原生加载。
 * ⚠ 判据用 location.protocol 而非 import.meta.env.DEV——vite 6 dev 下其求值不可靠，
 * 误判会走协议分支导致双 SDK 实例。`@vite-ignore` 必带：阻止构建期静态分析动态 URL。
 */
function isDevServerOrigin(): boolean {
  return location.protocol === 'http:' || location.protocol === 'https:'
}

function pluginEntryUrl(id: string, entry: string): string {
  return isDevServerOrigin() ? `/plugins/${id}/${entry}` : `aidea-plugin://${id}/${entry}`
}

/** 订阅插件目录变更（main 监听 → 桥推送变更 id 列表）。返回退订函数。 */
export function subscribePluginChanges(cb: (ids: string[]) => void): () => void {
  return bridge.onPluginsChanged(cb)
}

/** 收集桌面本地插件条目（每次 IPC 重扫，loader 惰性动态 import）。 */
export async function collectDesktopEntries(): Promise<PluginEntry[]> {
  let infos: DesktopPluginInfo[]
  try {
    infos = await bridge.listPlugins()
  } catch (e) {
    // IPC 失败（main 异常 / 壳层版本不符等）→ 空集兜底
    console.error('[plugin] 桌面插件扫描失败（IPC listPlugins）', e)
    return []
  }
  const entries: PluginEntry[] = []
  for (const info of infos) {
    if (info.error) continue // 结构非法等，装载层跳过
    const url = pluginEntryUrl(info.id, info.entry)
    // 装载留痕：确认桌面 dev 走 dev-server URL 分支还是协议分支（排障关键）
    console.info(`[plugin] 桌面源登记 ${info.id} ← ${url}`)
    entries.push({
      id: info.id,
      loader: () => import(/* @vite-ignore */ url),
    })
  }
  return entries
}