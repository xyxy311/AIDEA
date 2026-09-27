/**
 * i18nStore —— 运行时语言包登记中心（renderer 侧响应式内核）。
 * 持有宿主编译期内置种子（仅 zh-CN，永兜底）+ 运行时从 i18n 目录经 loader 登记的语言包。
 * readBundles() 供 useT.createT 的 getter 读取（响应式：热登记/热替换即时生效）；available 供
 * 语言下拉与 naiveBase 映射派生；注册时校验 @meta（复用 shared/i18n.ts 的 parseLanguageMeta）。
 */
import { computed, reactive } from 'vue'
import { defineStore } from 'pinia'
import zhCN from '@/locales/zh-CN.json'
import { LOCALE_ENTRIES, DEFAULT_LOCALE } from '@/constants/locale'
import type { TBundle } from '@/composables/useT'
import { isValidI18nId, parseLanguageMeta } from '../../electron/shared/i18n'

/** 下拉/登记的单个可用语言 */
export interface AvailableLocale {
  id: string
  label: string
  naiveBase: string
  builtin: boolean
}

export const useI18nStore = defineStore('i18n', () => {
  /** 语言包内容（含 @meta 头；t() 只遍历点路径，@meta 不影响取值），seed 预填 zh-CN */
  const bundles = reactive<Record<string, TBundle>>({ [DEFAULT_LOCALE]: zhCN })
  /** 各语言元数据（id→元信息），seed 来自 LOCALE_ENTRIES，运行时语言登记时并入 */
  const locales = reactive<Record<string, AvailableLocale>>(
    Object.fromEntries(LOCALE_ENTRIES.map((e) => [e.id, { ...e, builtin: true }])),
  )

  /** 当前可用语言列表（内置种子在前，运行时登记在后），供语言下拉渲染 */
  const available = computed<AvailableLocale[]>(() => Object.values(locales))

  /**
   * 登记一个语言包（含内容覆盖）。@meta 缺失/非法或 id 不符 → 拒绝并返回 error（静默跳过）。
   * 覆盖已存在 id 时即热替换文案（响应式链即时刷新）。
   */
  function registerPackage(id: string, bundle: TBundle): { ok: boolean; error?: string } {
    if (!isValidI18nId(id)) return { ok: false, error: '语言 id 含非法字符' }
    const res = parseLanguageMeta(bundle, id)
    if (!res.ok) return { ok: false, error: res.error }
    locales[id] = { ...res.meta, builtin: id === DEFAULT_LOCALE }
    bundles[id] = bundle
    return { ok: true }
  }

  /** 注销一个语言包（运行时文件被删除时调用）。内置种子 zh-CN 永不可注销（安全网）。 */
  function unregisterPackage(id: string): void {
    if (id === DEFAULT_LOCALE) return
    if (!locales[id]) return
    delete locales[id]
    delete bundles[id]
  }

  /** 全部语言包集合（响应式对象），供 createT 的 getter 在每次 t() 求值时读取 */
  function readBundles(): Record<string, TBundle> {
    return bundles
  }

  return { bundles, available, registerPackage, unregisterPackage, readBundles }
})