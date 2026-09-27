/**
 * i18n.ts —— 语言包公共契约（main / preload / renderer 共享，零依赖）。
 *
 * 语言包自描述 @meta：{ id, label, naiveBase }。id 须与文件名（去 .json）一致并强校验
 * ^[a-zA-Z0-9_-]+$（注意允许大写：zh-CN / en-US 均含大写字母）。naiveBase 缺省兜底 'en-US'。
 * 解析/校验为纯函数，main 的 i18nScan 与 renderer 的 i18nStore.registerPackage 复用同一实现（防御纵深）。
 */

/** 语言包 id 强校验：字母（含大写）/数字/下划线/连字符 */
export const I18N_ID_RE = /^[a-zA-Z0-9_-]+$/

/** 判定语言 id 是否合法 */
export function isValidI18nId(id: string): boolean {
  return I18N_ID_RE.test(id)
}

/** naiveBase 的缺省兜底（语言包未声明 / naive 未内置时的回退语言） */
export const DEFAULT_NAIVE_BASE = 'en-US'

/** 语言包 @meta 解析结果（label 为语言自名，不可翻译） */
export interface LanguageMeta {
  id: string
  label: string
  naiveBase: string
}

/** 从语言包对象解析并校验 @meta；返回 ok 的 meta 或 error（不抛，供调用方静默跳过非法包） */
export function parseLanguageMeta(
  bundle: Record<string, unknown>,
  id: string,
): { ok: true; meta: LanguageMeta } | { ok: false; error: string } {
  const meta = bundle['@meta']
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { ok: false, error: '缺少合法 @meta 对象' }
  }
  const m = meta as Record<string, unknown>
  if (m.id !== id) return { ok: false, error: '@meta.id 与语言 id 不符' }
  if (!isValidI18nId(id)) return { ok: false, error: '语言 id 含非法字符' }
  if (typeof m.label !== 'string' || m.label.trim() === '') {
    return { ok: false, error: '@meta.label 须为非空字符串' }
  }
  const naiveBase = typeof m.naiveBase === 'string' && m.naiveBase ? m.naiveBase : DEFAULT_NAIVE_BASE
  return { ok: true, meta: { id: String(m.id), label: m.label, naiveBase } }
}