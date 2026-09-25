/**
 * 语言注册表：界面语言的单一清单（单一数据源），语言选择器与 naive-ui 文案映射均以它为准。
 * label 为语言自名（不可翻译文本，不走语言包）。
 */
import type { LocaleId } from '@/types/locale'

export interface LocaleOption {
  /** 语言标识，对应 LocaleId（持久化于 localStorage('aidea-locale')） */
  id: LocaleId
  /** 语言自名（不可翻译文本，直接写各语言自身文字） */
  label: string
}

export const LOCALE_OPTIONS: ReadonlyArray<LocaleOption> = [
  { id: 'zh-CN', label: '简体中文' },
  { id: 'en-US', label: 'English' },
]
