/** useT i18n 响应式内核测试：点路径取值与 {name} 插值、setLocale 切换持久化、宿主仅中文内置回退、createT 响应、未命中回退 key */
import { describe, it, expect, beforeEach } from 'vitest'
import { computed, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { t, getLocale, createT, type TBundles } from '@/composables/useT'
import { useThemeStore } from '@/stores/theme'
import { useI18nStore } from '@/stores/i18n'

describe('useT（i18n 响应式内核）', () => {
  beforeEach(() => {
    localStorage.clear()
    // 每个用例新建 pinia：useT 的缓存按活动 pinia 实例失效重建，读到干净的默认状态
    setActivePinia(createPinia())
  })

  it('默认语言 en-US：运行时包未登记时回退内置 zh-CN 表（点路径取值 + {name} 插值）', () => {
    expect(getLocale()).toBe('en-US')
    expect(t('menuBar.file')).toBe('文件')
    expect(t('menuBar.openFailed', { message: '磁盘已满' })).toBe('打开文件失败：磁盘已满')
  })

  it('setLocale：getLocale 跟随变化并持久化到 localStorage', async () => {
    const theme = useThemeStore()
    theme.setLocale('en-US')
    expect(theme.locale).toBe('en-US')
    expect(getLocale()).toBe('en-US')
    // useStorage 对字符串默认值用原生 string 序列化器（裸字符串），写入经 flush:"pre" 异步落盘
    await nextTick()
    expect(localStorage.getItem('aidea-locale')).toBe('en-US')

    theme.setLocale('zh-CN')
    expect(getLocale()).toBe('zh-CN')
  })

  it('宿主仅中文内置：未登记语言回退中文表（en-US 走运行时装载，不入 bundle）', () => {
    useThemeStore().setLocale('en-US')
    expect(getLocale()).toBe('en-US')
    // 全局 t 只绑 zh-CN，未登记语言落到新内核的 zh 表回退
    expect(t('menuBar.file')).toBe('文件')
  })

  it('createT：多语言包集合按当前语言取文案，未覆盖 key 回退 zh-CN 表', () => {
    const bundles: TBundles = {
      'zh-CN': { menuBar: { file: '文件', saved: '已保存' } },
      'en-US': { menuBar: { file: 'File' } },
    }
    const localT = createT(bundles)
    const theme = useThemeStore()

    theme.setLocale('zh-CN')
    expect(localT('menuBar.file')).toBe('文件')
    theme.setLocale('en-US')
    expect(localT('menuBar.file')).toBe('File')
    // en 未覆盖的 key → 回退 zh-CN 表（回退链中间环节）
    expect(localT('menuBar.saved')).toBe('已保存')
  })

  it('未命中：不存在的 key 返回 key 本身（回退链末端）', () => {
    // 回退链：当前语言表 → zh-CN 表 → key 本身。两级均未命中时返回 key
    expect(t('no.such.key')).toBe('no.such.key')
    expect(t('no.such.key', { name: '占位' })).toBe('no.such.key')
  })

  it('响应性：computed 内调用 t()，setLocale 后值随语言热更新', () => {
    const theme = useThemeStore()
    const localT = createT({
      'zh-CN': { menuBar: { file: '文件' } },
      'en-US': { menuBar: { file: 'File' } },
    })
    const label = computed(() => localT('menuBar.file'))
    theme.setLocale('zh-CN')
    expect(label.value).toBe('文件')

    theme.setLocale('en-US')
    expect(label.value).toBe('File')

    theme.setLocale('zh-CN')
    expect(label.value).toBe('文件')
  })

  it('createT getter 形态：随 i18nStore 热登记/热替换即时生效（自动登记回归）', () => {
    const store = useI18nStore()
    const theme = useThemeStore()
    // 宿主全局同类：source 为取值函数，读响应式 i18nStore
    const g = createT(() => store.readBundles())

    // 未登记 es-ES 时，locale 指向 es-ES → 回退 zh 表
    theme.setLocale('es-ES')
    expect(g('menuBar.file')).toBe('文件')

    // 热登记 es-ES → 即时命中
    store.registerPackage('es-ES', {
      '@meta': { id: 'es-ES', label: 'Español' },
      menuBar: { file: 'Archivo' },
    })
    expect(g('menuBar.file')).toBe('Archivo')

    // 热替换内容 → getter 读到的响应式 store 即时更新
    store.registerPackage('es-ES', {
      '@meta': { id: 'es-ES', label: 'Español' },
      menuBar: { file: 'Archivo v2' },
    })
    expect(g('menuBar.file')).toBe('Archivo v2')

    // 注销后回退 zh
    store.unregisterPackage('es-ES')
    expect(g('menuBar.file')).toBe('文件')
  })
})