/**
 * desktop.ts —— 桌面本地插件源（Electron 壳扫描插件目录）
 *
 * ⚠ 全 renderer 唯一的 `window.aideaDesktop` 桥访问点（蓝图红线 1）：
 * - web 形态无桥（undefined）→ 返回空集，静默降级，行为与无此文件等价；
 * - IPC 调用失败 → console.error + 空集，不阻塞内置插件装载；
 * - `info.error` 非空的条目（结构非法等）被过滤，装载层不感知。
 *
 * 除本文件外，renderer 任何代码不得探测桌面桥（插件代码亦禁，见蓝图红线 5）；
 * IPC 契约类型来自 electron/shared/bridge.ts（type-only import，契约文件冻结）。
 */
import type { DesktopPluginInfo } from '../../../electron/shared/bridge'
import type { PluginEntry } from '../manager'

// 全 renderer 唯一桥访问点：模块加载时读取一次（Electron preload 注入先于应用脚本执行）
const bridge = window.aideaDesktop ?? null

/**
 * 收集桌面本地插件条目：loader 为 `aidea-plugin://` 协议 URL 的惰性动态 import。
 * `/* @vite-ignore *​/` 必须带上——阻止 Vite 静态分析协议 URL（运行时才可解析）。
 */
export async function collectDesktopEntries(): Promise<PluginEntry[]> {
  if (!bridge) return []
  let infos: DesktopPluginInfo[]
  try {
    infos = await bridge.listPlugins()
  } catch (e) {
    // IPC 失败（main 异常 / 壳层版本不符等）→ 空集兜底，不影响内置装载
    console.error('[plugin] 桌面插件扫描失败（IPC listPlugins）', e)
    return []
  }
  const entries: PluginEntry[] = []
  for (const info of infos) {
    if (info.error) continue // 结构非法等原因（UI 可在扫描结果侧展示，装载层跳过）
    entries.push({
      id: info.id,
      loader: () => import(/* @vite-ignore */ `aidea-plugin://${info.id}/${info.entry}`),
      source: 'local',
    })
  }
  return entries
}
