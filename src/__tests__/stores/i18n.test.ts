/**
 * i18nStore 单测：内置种子预填（仅 zh-CN）、registerPackage 校验与合并（含 naiveBase 缺省）、
 * unregisterPackage 删除（内置 zh-CN 不可注销）、builtin 标记。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useThemeStore } from '@/stores/theme'
import { useI18nStore } from '@/stores/i18n'

/** 构造带 @meta 的语言包（naiveBase 可选） */
function makeBundle(id: string, naiveBase?: string): Record<string, unknown> {
  return { '@meta': { id, label: `Lang ${id}`, naiveBase: naiveBase ?? 'en-US' }, common: { confirm: `OK ${id}` } }
}

describe('i18nStore（运行时语言包登记）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('种子预填：仅 zh-CN 内置，builtin 标记为 true', () => {
    const store = useI18nStore()
    expect(store.available).toEqual([
      { id: 'zh-CN', label: '简体中文', naiveBase: 'zh-CN', builtin: true },
    ])
    // bundles 里 zh-CN 有内容（内置 seed 相对应的 JSON）
    expect(store.readBundles()['zh-CN']).toBeTruthy()
  })

  it('registerPackage：合法包并入 available + bundles，naiveBase 缺省默认 en-US，builtin=false', () => {
    const store = useI18nStore()
    const res = store.registerPackage('es-ES', makeBundle('es-ES'))
    expect(res).toEqual({ ok: true })
    expect(store.available.map((l) => l.id)).toEqual(['zh-CN', 'es-ES'])
    expect(store.available[1]).toMatchObject({ id: 'es-ES', label: 'Lang es-ES', naiveBase: 'en-US', builtin: false })
    expect((store.readBundles()['es-ES'] as Record<string, unknown>).common).toEqual({ confirm: 'OK es-ES' })
  })

  it('registerPackage：显式 naiveBase 生效', () => {
    const store = useI18nStore()
    store.registerPackage('ja-JP', makeBundle('ja-JP', 'ja-JP'))
    expect(store.available.find((l) => l.id === 'ja-JP')?.naiveBase).toBe('ja-JP')
  })

  it('registerPackage：@meta 缺失 / id 不符 / id 含非法字符 → 拒绝且不进入 available', () => {
    const store = useI18nStore()
    // 缺 @meta
    expect(store.registerPackage('x', { common: { confirm: 'x' } }).ok).toBe(false)
    // @meta.id 与传入 id 不符
    expect(store.registerPackage('x', makeBundle('y')).ok).toBe(false)
    // id 含非法字符（文件名规范不允许空格/点）
    expect(store.registerPackage('has space', makeBundle('has space')).ok).toBe(false)
    expect(store.available.map((l) => l.id)).toEqual(['zh-CN'])
  })

  it('registerPackage：注册已存在 id → 覆盖内容（热替换）', () => {
    const store = useI18nStore()
    store.registerPackage('es-ES', makeBundle('es-ES'))
    store.registerPackage('es-ES', {
      '@meta': { id: 'es-ES', label: 'Español', naiveBase: 'en-US' },
      common: { confirm: 'Actualizado' },
    })
    const b = store.readBundles()['es-ES'] as Record<string, unknown>
    expect((b.common as Record<string, unknown>).confirm).toBe('Actualizado')
  })

  it('unregisterPackage：删除非内置语言；内置 zh-CN 不可注销（安全网）', () => {
    const store = useI18nStore()
    store.registerPackage('es-ES', makeBundle('es-ES'))
    store.unregisterPackage('es-ES')
    expect(store.available.map((l) => l.id)).toEqual(['zh-CN'])

    // 注销内置 zh-CN 被拒绝：仍保留
    store.unregisterPackage('zh-CN')
    expect(store.available.map((l) => l.id)).toEqual(['zh-CN'])
    expect(store.readBundles()['zh-CN']).toBeTruthy()
  })

  it('删除当前在用语言：registerPackage/unregister 触发响应式，语言下拉随之变化', () => {
    const theme = useThemeStore()
    const store = useI18nStore()
    theme.setLocale('zh-CN')
    store.registerPackage('es-ES', makeBundle('es-ES'))
    expect(store.available.some((l) => l.id === 'es-ES')).toBe(true)
    store.unregisterPackage('es-ES')
    expect(store.available.some((l) => l.id === 'es-ES')).toBe(false)
  })
})