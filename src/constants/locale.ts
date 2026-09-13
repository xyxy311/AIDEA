/**
 * 语言注册表 - 界面语言的单一清单（单一数据源）
 *
 * 语言选择器（设置 → 外观）与 naive-ui 文案映射均以此为准；
 * 条目顺序即选择器展示顺序。
 *
 * label 是「语言自名」：各语言用自身文字显示（如日语显示「日本語」），
 * 属不可翻译文本，因此不走语言包（locales/*.json）。
 *
 * 未来新增语言（如日语 'ja-JP'）：
 * 1. 在 src/types/locale.ts 的 LocaleId 联合类型追加新 id；
 * 2. 在下方 LOCALE_OPTIONS 追加对应条目；
 * 3. 新增语言包文件 src/locales/<id>.json 并在 src/composables/useT.ts 注册；
 * 4. 在 src/App.vue 的 naive 文案映射表补一行。
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
