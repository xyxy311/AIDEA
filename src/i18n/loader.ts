/**
 * loader.ts —— 运行时 i18n 装载源（全 renderer 唯一的 window.aideaI18n 桥访问点，仿 sources/desktop.ts）。
 * reloadI18n()：list() → 全量对账（注销已消失的非内置语言）→ 逐个 read() 并 registerPackage()；
 * 删除当前在用语言时回退内置兜底语言（zh-CN，安全网）。订阅 onChanged 实现 i18n 目录增删改热登记（即插即用）。
 * ⚠ 模块加载时读桥（preload 注入先于应用脚本）；IPC 失败一律 console.error + 空集兜底，不崩。
 */
import type { I18nBridge } from '../../electron/shared/bridge'
import { useI18nStore } from '@/stores/i18n'
import { useThemeStore } from '@/stores/theme'
import { BUILTIN_LOCALE } from '@/constants/locale'

// 全 renderer 唯一桥访问点
const bridge: I18nBridge = window.aideaI18n

/** 订阅运行时 i18n 目录变更（main 监听 → 桥推送变更语言 id 列表）。返回退订函数。 */
export function subscribeI18nChanges(cb: (ids: string[]) => void): () => void {
  return bridge.onChanged(cb)
}

/**
 * 全量重扫运行时 i18n 目录并登记/注销语言，最后处理"当前在用语言被删 → 回退默认语言"。
 */
export async function reloadI18n(): Promise<void> {
  let infos
  try {
    infos = await bridge.list()
  } catch (e) {
    console.error('[i18n] 运行时 i18n 扫描失败（IPC list）', e)
    return
  }
  const i18n = useI18nStore()
  const listed = new Set(infos.map((i) => i.id))

  // 注销运行时目录中已消失的非内置语言（内置 zh-CN 永不可注销，见 store 的 unregisterPackage 守卫）
  for (const a of i18n.available) {
    if (!a.builtin && !listed.has(a.id)) i18n.unregisterPackage(a.id)
  }

  // 逐个读取并按 @meta 登记/覆盖；读/解析/校验失败静默跳过，不中断其余语言
  for (const info of infos) {
    let res
    try {
      res = await bridge.read(info.id)
    } catch (e) {
      console.error(`[i18n] 读取语言 ${info.id} 失败`, e)
      continue
    }
    try {
      const bundle = JSON.parse(res.content) as Record<string, unknown>
      const r = i18n.registerPackage(info.id, bundle)
      if (!r.ok) console.error(`[i18n] 语言 ${info.id} 登记被拒：${r.error}`)
    } catch (e) {
      console.error(`[i18n] 语言 ${info.id} 内容解析失败，已跳过`, e)
    }
  }

  // 当前在用语言已从语言表消失 → 回退内置兜底语言（zh-CN 永远可用；安全网，available 由响应式链驱动下拉同步）
  if (!i18n.available.some((a) => a.id === useThemeStore().locale)) {
    useThemeStore().setLocale(BUILTIN_LOCALE)
  }
}