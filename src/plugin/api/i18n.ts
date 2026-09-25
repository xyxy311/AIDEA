/**
 * api/i18n.ts —— 多语言域：界面语言只读查询 + 插件自有语言包工厂
 * 插件文案不进宿主 locales，多语言插件把 plugins/<name>/locales/ 的包 import 给 createT(bundles)；
 * 回退链：插件当前语言 → zh-CN → key。语言是用户设置（只读，不暴露 setLocale）。
 * t()/createT 内部转发 useT 占位层读 themeStore.locale，在模板/computed 中调用即随语言热更新，勿赋模块级常量。
 */
import type { LocaleId } from '@/types/locale'
import { createT, getLocale, t } from '@/composables/useT'
import type { TBundles, TFunction } from '@/composables/useT'

export function createI18nApi() {
  const api = {
    /** 当前界面语言：'zh-CN' | 'en-US'（只读快照；切换入口在设置面板，插件不可写） */
    getLocale(): LocaleId {
      return getLocale()
    },
    /** 取宿主表文本：key 为点路径，可选 params 做 {name} 插值 */
    t(key: string, params?: Record<string, string | number>): string {
      return t(key, params)
    },
    /**
     * 创建插件自有 t 函数（插件多语言推荐用法）：bundles 传插件自有语言包
     * （import plugins/<name>/locales/zh-CN.json 与 en-US.json）。
     * 回退链：当前语言 → zh-CN → key；产物内部读 themeStore.locale 随语言热更新。
     */
    createT(bundles: TBundles): TFunction {
      return createT(bundles)
    },
  }
  return api
}

export type I18nApi = ReturnType<typeof createI18nApi>
