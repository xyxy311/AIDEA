/**
 * web.ts —— web 静态清单源（web 形态的「启动时扫描」等价物）
 *
 * web 无法读文件系统，等价机制 = fetch 根相对清单 `/plugins/index.json`
 * （[{ id, entry }]；由 scripts/package-plugin.mjs 打包时维护、scripts/build-web.mjs
 * 分发到 dist/plugins/；dev:web 下 vite 伺服仓库根同名文件）。
 * loader 为根相对 URL 的原生动态 import（@vite-ignore 与桌面源一致：插件代码不经
 * vite transform，bare import 由 index.html import map 解析到 /vendor/*.js，
 * 与宿主共享同一 SDK 实例）；fetch 失败/非 200 → console.error + 空集，不阻塞应用。
 * 清单条目做最小形状过滤（id/entry 须为非空字符串），异常数据跳过。
 */
import type { PluginEntry } from '../manager'

/** 清单条目最小形状守卫：id/entry 须为非空字符串（异常数据跳过，不炸装载） */
function isValidEntry(info: unknown): info is { id: string; entry: string } {
  if (typeof info !== 'object' || info === null) return false
  const { id, entry } = info as { id?: unknown; entry?: unknown }
  return typeof id === 'string' && id !== '' && typeof entry === 'string' && entry !== ''
}

/** 收集 web 静态清单声明的插件条目（source: 'local'，与桌面源同一装载语义） */
export async function collectWebEntries(): Promise<PluginEntry[]> {
  let list: unknown
  try {
    const res = await fetch('/plugins/index.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    list = await res.json()
  } catch (e) {
    console.error('[plugin] web 插件清单获取失败（/plugins/index.json）', e)
    return []
  }
  if (!Array.isArray(list)) {
    // 清单顶层形状非法（非数组）→ 与获取失败同待遇：空集兜底
    console.error('[plugin] web 插件清单形状非法（期望数组）')
    return []
  }
  return list
    .filter(isValidEntry)
    .map((info): PluginEntry => ({
      id: info.id,
      // @vite-ignore 必须带上——阻止 Vite 静态分析根相对 URL（运行时才可解析，与桌面源一致）
      loader: () => import(/* @vite-ignore */ `/plugins/${info.id}/${info.entry}`),
      source: 'local',
    }))
}
