/**
 * 语言种子表：编译期内置语言的单一数据源。
 * 仅 zh-CN 编译期内置（永远兜底、不可被移除）；其余语言于运行时由 i18n 目录装载后，
 * 经 i18nStore.available 动态登记（见 docs/多语言运行时改造计划.md）。
 * label 为语言自名（不可翻译文本，不走语言包）；naiveBase 为 naive-ui 文案兜底语言 id。
 */
import type { LocaleId } from '@/types/locale'

export interface LocaleEntry {
  /** 语言标识（对应 LocaleId，持久化于 localStorage('aidea-locale')） */
  id: LocaleId
  /** 语言自名（不可翻译文本，直接写各语言自身文字） */
  label: string
  /** naive-ui 文案兜底语言 id（App.vue 由此映射 NLocale） */
  naiveBase: string
}

/** 内置语言种子：仅 zh-CN 一行（其余语言运行时动态登记，见 i18nStore.available） */
export const LOCALE_ENTRIES: ReadonlyArray<LocaleEntry> = [
  { id: 'zh-CN', label: '简体中文', naiveBase: 'zh-CN' },
]

/** 默认界面语言 = 种子首语言（zh-CN）；themeStore 的 locale 默认值与本值一致 */
export const DEFAULT_LOCALE: LocaleId = LOCALE_ENTRIES[0].id

/** 语言选择器选项（由种子派生；运行时语言登记后下拉改由 i18nStore.available 接管） */
export interface LocaleOption {
  id: LocaleId
  label: string
}
export const LOCALE_OPTIONS: ReadonlyArray<LocaleOption> = LOCALE_ENTRIES.map(({ id, label }) => ({ id, label }))