/**
 * useT - 轻量文本访问层：宿主全局 t() 与插件语言包共用 createT 工厂。
 * 回退链 bundles[当前语言]→zh-CN→返回 key；经 getLocale 读 themeStore.locale，
 * 在模板/computed 内调用即建立响应式依赖。宿主仅 zh-CN 编译期内置兜底，其余语言运行时经 i18nStore 登记。未来迁移 vue-i18n 只需替换内部实现。
 */
import { getActivePinia } from 'pinia'
import { useThemeStore } from '@/stores/theme'
import { useI18nStore } from '@/stores/i18n'
import type { LocaleId } from '@/types/locale'

/** `{name}` 插值形参表 */
export type TParams = Record<string, string | number>

/** 单语言文案表：点路径 key → 文本；结构与宿主 src/locales/*.json 同构（两层嵌套） */
export type TBundle = Record<string, unknown>

/** createT 参数：按语言 id 注册的文案表集合，可只提供部分语言（缺失语言走回退链）；或返回该集合的 getter（宿主热登记用） */
export type TBundles = Partial<Record<LocaleId, TBundle>>

/** createT 的语言包来源：静态集合（插件）或取值函数（宿主从响应式 i18nStore 读取） */
export type BundleSource = TBundles | (() => TBundles)

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
 * - 宿主：createT(() => i18nStore.readBundles())（见下方 t 导出；getter 读响应式 store，热登记即生效）；
 * - 插件：把 plugins/<name>/locales/ 下的 JSON import 进来传静态集合
 *   （宿主侧转发入口为 adapter.api.i18n.createT）。
 *
 * 产物行为：
 * - 语言来源：内部经 getLocale() 读取 themeStore.locale——与全局 t() 同源，
 *   同样具备惰性获取 store + 未就绪回退中文的防御；在模板 / computed 中调用
 *   即自动建立响应式依赖，切换语言热更新；
 * - 回退链：bundles[当前语言] → bundles['zh-CN'] → 返回 key 本身；
 * - 插值：与全局 t() 共用同一份 `{name}` 逻辑。
 *
 * @param source 按语言 id 注册的文案表集合（结构可与宿主 locales JSON 同构，可只提供部分语言），
 *   或返回该集合的惰性 getter（宿主全局 t 用它读响应式 i18nStore，热登记/热替换即时生效）。
 */
export function createT(source: BundleSource): TFunction {
  return (key, params) => {
    const locale = getLocale()
    // getter 形态：每次求值调用一次（读 i18nStore.bundles 建立响应式依赖，运行期语言登记即时可读）
    const bundles = typeof source === 'function' ? source() : source
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

/** 宿主全局 t：语言包来源为响应式 i18nStore（seed 内置 zh-CN + 运行时登记），未就绪回退中文 */
export const t: TFunction = createT(() => useI18nStore().readBundles())
