/**
 * naiveLocale.ts —— 语言包 @meta.naiveBase → naive-ui NLocale / DateLocale 的运行时映射。
 * naive-ui 文案不作自编（单一源原则），语言包只声明所需的 naive 语言 id；此处按对象自带的
 * `name` 字段（如 'en-US'）建模，避免与 naive 内部命名漂移。未内置的 naiveBase 兜底 en-US。
 *
 * 注意：用具名 import + 显式配对而非 `import * as naive` 枚举——后者破坏 tree-shaking，
 * 会把整个 naive-ui 打进 bundle。此处只收录常见语言，其余兜底 en-US。
 */
import {
  zhCN, zhTW, enUS, enGB, jaJP, koKR, deDE, frFR, esAR, itIT, ptBR, ruRU,
  dateZhCN, dateZhTW, dateEnUS, dateEnGB, dateJaJP, dateKoKR, dateDeDE, dateFrFR, dateEsAR, dateItIT, datePtBR, dateRuRU,
} from 'naive-ui'
import type { NLocale, NDateLocale } from 'naive-ui'

/** naiveBase 的最终兜底（语言包未声明 / naive 未内置时的回退语言） */
export const DEFAULT_NAIVE_BASE = 'en-US'

/** naive 文案对象与其日期对象配对（同一语言，key 用各自 name 字段） */
const NAIVE_PAIRS: ReadonlyArray<[NLocale, NDateLocale]> = [
  [zhCN, dateZhCN], [zhTW, dateZhTW], [enUS, dateEnUS], [enGB, dateEnGB],
  [jaJP, dateJaJP], [koKR, dateKoKR], [deDE, dateDeDE], [frFR, dateFrFR],
  [esAR, dateEsAR], [itIT, dateItIT], [ptBR, datePtBR], [ruRU, dateRuRU],
]

const NAIVE_LOCALE_MAP: Record<string, NLocale> = {}
const NAIVE_DATE_LOCALE_MAP: Record<string, NDateLocale> = {}
for (const [locale, dateLocale] of NAIVE_PAIRS) {
  NAIVE_LOCALE_MAP[locale.name] = locale
  NAIVE_DATE_LOCALE_MAP[dateLocale.name] = dateLocale
}

/** naiveBase → NLocale；未内置（naive 无该语言）兜底 DEFAULT_NAIVE_BASE */
export function resolveNaiveLocale(naiveBase: string): NLocale {
  return NAIVE_LOCALE_MAP[naiveBase] ?? NAIVE_LOCALE_MAP[DEFAULT_NAIVE_BASE]
}

/** naiveBase → NDateLocale；未内置兜底 DEFAULT_NAIVE_BASE */
export function resolveNaiveDateLocale(naiveBase: string): NDateLocale {
  return NAIVE_DATE_LOCALE_MAP[naiveBase] ?? NAIVE_DATE_LOCALE_MAP[DEFAULT_NAIVE_BASE]
}