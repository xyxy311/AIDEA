/**
 * api/i18n.ts —— 多语言域：界面语言只读查询 + 插件自有语言包工厂
 * 接口类型由实现派生（`I18nApi = ReturnType<typeof createI18nApi>`）。
 *
 * - 产品口径：**插件文案不进宿主 locales**。宿主 src/locales/*.json 只承载
 *   宿主自身 UI 文本，不含插件分区；`t()` 仅用于读宿主既有文案，一般插件用不到。
 * - 插件文案归插件文件夹：需要多语言的插件把 plugins/<name>/locales/ 下的
 *   zh-CN.json / en-US.json import 进来传给 `createT(bundles)`，得到插件自己的 t；
 *   回退链为 插件包当前语言 → 插件包 zh-CN → key 本身。
 * - 不接多语言的插件可以纯硬编码成品字符串（i18n 域对这类插件完全可选）。
 * - 语言是用户设置（设置 → 外观 → 语言），对插件**只读**：不暴露 setLocale，
 *   插件无权切换语言（API 契约：只读、无副作用）。
 * - 响应式约定：t() / getLocale() / createT 产物内部均转发主程序 useT 占位层
 *   （src/composables/useT.ts）读取 themeStore.locale 建立依赖——在模板 /
 *   computed 中调用即自动订阅，切换语言热更新；不要把调用结果赋给模块级常量。
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
    /** 取宿主表文本：key 为点路径，可选 params 做 {name} 插值（宿主 locales 仅承载宿主自身文案） */
    t(key: string, params?: Record<string, string | number>): string {
      return t(key, params)
    },
    /**
     * 创建插件自有 t 函数（插件多语言推荐用法）：bundles 传**插件自有语言包**——
     * 把 plugins/<name>/locales/zh-CN.json 与 en-US.json import 进来即可：
     *   const t = api.i18n.createT({ 'zh-CN': zhCN, 'en-US': enUS })
     * 文案数据完全归插件文件夹，宿主 locales 不托管插件文案。
     * 回退链：插件包当前语言 → 插件包 zh-CN → key 本身；产物内部读
     * themeStore.locale，在模板 / computed 中调用即随语言热更新。
     * 不接多语言的插件无需使用本方法（纯硬编码合法）。
     */
    createT(bundles: TBundles): TFunction {
      return createT(bundles)
    },
  }
  return api
}

export type I18nApi = ReturnType<typeof createI18nApi>
