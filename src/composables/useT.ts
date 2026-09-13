/**
 * useT - 轻量文本访问层（响应式多语言）
 *
 * 提供两部分能力：
 * 1. 宿主全局 `t()`：宿主本地化资源（src/locales/*.json）的唯一访问入口。
 *    语言状态归属 themeStore（useStorage 持久化到 localStorage('aidea-locale')，
 *    经 setLocale 切换）。支持点路径取值（如 `t('menuBar.file')`）与 `{name}` 插值。
 * 2. 可复用工厂 `createT(bundles)`：以同一机制构造独立的 t 函数。宿主表与
 *    **插件自有语言包**共用此工厂——插件文案数据归插件文件夹
 *    （plugins/<name>/locales/ 下的 JSON），不经宿主 locales 托管
 *    （见 plugin/api/i18n.ts 的转发暴露）。
 *
 * 取值回退链：bundles[当前语言] → bundles['zh-CN'] → 返回 key 本身（便于发现遗漏）。
 *
 * 响应式机制：t() / createT 产物内部经 getLocale() 读取 themeStore.locale
 * （useStorage ref，经 store 代理访问即建立响应式依赖），模板 / computed 上下文
 * 调用时自动订阅，切换语言即热更新。
 *
 * 未来引入 vue-i18n 时，只需把本文件内部实现替换为 vue-i18n 的 t 函数，
 * 调用方（组件 / composable / store）签名零改动；JSON 资源结构直接兼容。
 */
import { getActivePinia } from 'pinia'
import zhCN from '@/locales/zh-CN.json'
import enUS from '@/locales/en-US.json'
import { useThemeStore } from '@/stores/theme'
import type { LocaleId } from '@/types/locale'

/** `{name}` 插值形参表 */
export type TParams = Record<string, string | number>

/** 单语言文案表：点路径 key → 文本；结构与宿主 src/locales/*.json 同构（两层嵌套） */
export type TBundle = Record<string, unknown>

/** createT 参数：按语言 id 注册的文案表集合，可只提供部分语言（缺失语言走回退链） */
export type TBundles = Partial<Record<LocaleId, TBundle>>

/** createT 产物：与全局 t() 同签名的翻译函数 */
export type TFunction = (key: string, params?: TParams) => string

/** 兜底语言：pinia 未就绪、locale 值异常、语言表未命中等场景统一回退到中文 */
const FALLBACK_LOCALE: LocaleId = 'zh-CN'

/** 按点路径从对象取值 */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

/** `{name}` 形参插值：按 entries 顺序逐个替换占位符（宿主表与插件语言包共用一份实现） */
function interpolate(msg: string, params?: TParams): string {
  if (!params) return msg
  let out = msg
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v))
  }
  return out
}

/**
 * 惰性解析并缓存 themeStore：
 * - 不能在模块顶层调用 useThemeStore()（import 时序早于 app.use(pinia) 会抛错）；
 * - 缓存绑定创建时的活动 pinia 实例，活动 pinia 变化（如测试间新建 pinia）时失效重建；
 * - 未就绪（pinia 未安装）时返回 null，调用方走兜底语言。
 */
let cachedStore: ReturnType<typeof useThemeStore> | null = null
let cachedPinia: ReturnType<typeof getActivePinia>

function resolveThemeStore(): ReturnType<typeof useThemeStore> | null {
  try {
    const active = getActivePinia()
    if (!cachedStore || cachedPinia !== active) {
      cachedStore = useThemeStore()
      cachedPinia = active
    }
    return cachedStore
  } catch {
    // pinia 未安装（如纯函数在应用装配前被调用）：置空缓存，走兜底语言
    cachedStore = null
    cachedPinia = undefined
    return null
  }
}

/**
 * 当前界面语言。经 store 代理读取 locale（useStorage ref 解包值），
 * 该读取发生在调用方的响应式上下文（computed / render）内时自动建立依赖。
 */
export function getLocale(): LocaleId {
  const store = resolveThemeStore()
  return store ? store.locale : FALLBACK_LOCALE
}

/**
 * t 函数工厂：按传入的语言包集合构造一个独立的 t 函数。
 *
 * 宿主全局 t() 与插件自有语言包共用此工厂：
 * - 宿主：createT({ 'zh-CN': zhCN, 'en-US': enUS })（见下方 t 导出）；
 * - 插件：把 plugins/<name>/locales/ 下的 JSON import 进来传入
 *   （宿主侧转发入口为 adapter.api.i18n.createT）。
 *
 * 产物行为：
 * - 语言来源：内部经 getLocale() 读取 themeStore.locale——与全局 t() 同源，
 *   同样具备惰性获取 store + 未就绪回退中文的防御；在模板 / computed 中调用
 *   即自动建立响应式依赖，切换语言热更新；
 * - 回退链：bundles[当前语言] → bundles['zh-CN'] → 返回 key 本身；
 * - 插值：与全局 t() 共用同一份 `{name}` 逻辑。
 *
 * @param bundles 按语言 id 注册的文案表集合；结构可与宿主 locales JSON 同构
 *   （点路径 / 两层嵌套均可），可只提供部分语言（如仅 zh-CN）。
 */
export function createT(bundles: TBundles): TFunction {
  return (key, params) => {
    const locale = getLocale()
    // 运行时防御：locale 值异常或 bundles 未注册该语言表时回退中文表
    const bundle = bundles[locale] ?? bundles[FALLBACK_LOCALE]
    let raw = getByPath(bundle, key)
    if (typeof raw !== 'string' && locale !== FALLBACK_LOCALE) {
      // 当前语言表未命中 → 回退 zh-CN 表
      raw = getByPath(bundles[FALLBACK_LOCALE], key)
    }
    return interpolate(typeof raw === 'string' ? raw : key, params)
  }
}

/** 宿主全局 t：宿主 locales（src/locales/*.json）的翻译入口，机制与回退链见 createT */
export const t: TFunction = createT({ 'zh-CN': zhCN, 'en-US': enUS })
