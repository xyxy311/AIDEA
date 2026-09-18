/**
 * desktop.ts —— 桌面本地插件源（Electron 壳扫描插件目录）
 *
 * ⚠ 全 renderer 唯一的 `window.aideaDesktop` 桥访问点（蓝图红线 1）：
 * - web 形态无桥（undefined）→ 返回空集，静默降级，行为与无此文件等价；
 * - IPC 调用失败 → console.error + 空集，不阻塞其他插件装载；
 * - `info.error` 非空的条目（结构非法等）被过滤，装载层不感知。
 *
 * 互斥语义（蓝图 §4/红线 8）：聚合层据此源的「有桥与否」二选一——有桥只出桌面源，
 * 无桥只出 web 清单源，两者绝不并集。
 *
 * 除本文件外，renderer 任何代码不得探测桌面桥（插件代码亦禁，见蓝图红线 5）；
 * IPC 契约类型来自 electron/shared/bridge.ts（type-only import，契约文件冻结）。
 */
import type { DesktopPluginInfo } from '../../../electron/shared/bridge'
import type { PluginEntry } from '../manager'

// 全 renderer 唯一桥访问点：模块加载时读取一次（Electron preload 注入先于应用脚本执行）
const bridge = window.aideaDesktop ?? null

/** 桌面运行态标记（蓝图红线 8）：聚合据此互斥——有桥只出桌面源，无桥只出 web 清单源 */
export const isDesktopRuntime = bridge !== null

/**
 * 入口 URL 的运行时分支（SDK 单实例，蓝图 §6/红线 9；分支收敛在 sources/ 内）：
 * 判据 = renderer 是否由 dev server 伺服（location.protocol 为 http/https）——
 * dev server origin 下 /plugins/<id>/plugin.js 是可被 vite transform 的根相对 URL：
 * bare import 重写为预打包产物，与宿主共享同一 SDK 模块实例（dev 归一走 vite 原生
 * 模块图，不经 import map；resolve.alias 无法产出 URL 形态的解析结果，已踩坑）。
 * 非 http origin（桌面生产 app:// / file:）下该相对 URL 无伺服，走 aidea-plugin://
 * 协议原生加载，bare import 由 import map 解析到 /vendor/*.js，与宿主
 * （build external → import map）同一实例。
 *
 * ⚠ 判据不要用 import.meta.env.DEV：vite 6 dev 下它是「模块顶部注入的运行时对象」
 *   （import.meta.env = {...}）而非编译期字面量替换，真机 Electron dev renderer 里
 *   求值结果不可靠（实测落到 false → 走协议分支 → vendor 双 SDK 实例 → 插件组件
 *   useStore 崩 `_s`）。location.protocol 直接反映「能否被 dev server transform」，
 *   无编译器机制依赖，四形态自洽（web dev/生产 http ✓、桌面 dev http ✓、
 *   桌面生产 app:// 非 http ✓）。
 * `/* @vite-ignore *​/` 必须带上——阻止构建期静态分析动态 URL（运行时才可解析）；
 *   dev 下 server 端是否 transform 由请求路径决定，与该注释无关。
 */
function isDevServerOrigin(): boolean {
  return location.protocol === 'http:' || location.protocol === 'https:'
}

function pluginEntryUrl(id: string, entry: string): string {
  return isDevServerOrigin() ? `/plugins/${id}/${entry}` : `aidea-plugin://${id}/${entry}`
}

/**
 * 订阅插件目录变更（main watch → 桥推送变更 id 列表；M2）。
 * 无桥（web 形态）返回 no-op——web 全程无感知，dirDirty 恒 false。
 * 返回退订函数。桥访问唯一收敛本文件（蓝图红线 1）。
 */
export function subscribePluginChanges(cb: (ids: string[]) => void): () => void {
  if (!bridge) return () => {}
  return bridge.onPluginsChanged(cb)
}

/**
 * 收集桌面本地插件条目（每次 IPC 重扫，loader 惰性动态 import）。
 */
export async function collectDesktopEntries(): Promise<PluginEntry[]> {
  if (!bridge) return []
  let infos: DesktopPluginInfo[]
  try {
    infos = await bridge.listPlugins()
  } catch (e) {
    // IPC 失败（main 异常 / 壳层版本不符等）→ 空集兜底，不互相回退
    console.error('[plugin] 桌面插件扫描失败（IPC listPlugins）', e)
    return []
  }
  const entries: PluginEntry[] = []
  for (const info of infos) {
    if (info.error) continue // 结构非法等原因（UI 可在扫描结果侧展示，装载层跳过）
    const url = pluginEntryUrl(info.id, info.entry)
    // 装载留痕：确认桌面 dev 走的是 dev-server URL 分支还是协议分支（排障关键）
    console.info(`[plugin] 桌面源登记 ${info.id} ← ${url}`)
    entries.push({
      id: info.id,
      loader: () => import(/* @vite-ignore */ url),
      source: 'local',
    })
  }
  return entries
}
