/** useT i18n 响应式内核测试：点路径取值与 {name} 插值、setLocale 切换持久化、en 包、未命中回退 key、computed 响应 */
import { describe, it, expect, beforeEach } from 'vitest'
import { computed, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { t, getLocale } from '@/composables/useT'
import { useThemeStore } from '@/stores/theme'

describe('useT（i18n 响应式内核）', () => {
  beforeEach(() => {
    localStorage.clear()
    // 每个用例新建 pinia：useT 的缓存按活动 pinia 实例失效重建，读到干净的默认状态
    setActivePinia(createPinia())
  })

  it('默认语言 zh-CN：点路径取值 + {name} 插值', () => {
    expect(getLocale()).toBe('zh-CN')
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

  it('en-US 完整英文包：命中英文文案 + {name} 插值', () => {
    useThemeStore().setLocale('en-US')
    expect(getLocale()).toBe('en-US')
    // en-US.json 已填充为与 zh 结构对齐的完整英文包（key 一致性由 parity 测试守护）
    expect(t('menuBar.file')).toBe('File')
    expect(t('menuBar.openFailed', { message: 'x' })).toBe('Failed to open file: x')
  })

  it('未命中：不存在的 key 返回 key 本身（回退链末端）', () => {
    // t() 回退链：当前语言表 → zh-CN 表 → key 本身。en-US 包当前与 zh 全量对齐，
    // 不存在「仅 zh 有」的真实 key 可触发中间环节「en 未命中 → zh 回退」，
    // 故不在测试里伪造数据或 mock 整包；回退链末端（两级均未命中）由本用例覆盖。
    expect(t('no.such.key')).toBe('no.such.key')
    expect(t('no.such.key', { name: '占位' })).toBe('no.such.key')
  })

  it('响应性：computed 内调用 t()，setLocale 后值随语言热更新', () => {
    const theme = useThemeStore()
    const label = computed(() => t('menuBar.file'))
    expect(label.value).toBe('文件')

    theme.setLocale('en-US')
    // 值随 locale 变化重算（'文件' → 'File'）= 依赖已建立，比此前的求值计数断言更直接
    expect(label.value).toBe('File')

    theme.setLocale('zh-CN')
    expect(label.value).toBe('文件')
  })
})
