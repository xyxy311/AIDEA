import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { t } from '../i18n'
import { adapter } from '@/plugin/adapter'
import { useThemeStore } from '@/stores/theme'

/**
 * 插件自有语言包（plugins/ai/i18n.ts）冒烟：
 * 插件 t 经 adapter.api.i18n.createT 工厂构造，与宿主 t 同机制（读 themeStore.locale），
 * 数据源为 plugins/ai/locales/ 下的插件自有 JSON（迁移自宿主 locales 的 aiPanel/aiWord 分区，
 * 包内保留同名顶层分区结构，故 key 字符串参数不变）。
 * 回退链：插件包当前语言 → 插件包 zh-CN → key 本身。
 */
describe('插件自有语言包 t（plugins/ai/i18n.ts）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // locale 持久化于 localStorage（useStorage），显式重置避免测试间残留
    useThemeStore().setLocale('zh-CN')
  })

  it('回退链：当前语言表命中 → 当前语言缺失回退 zh-CN 表 → 两表未命中返回 key 本身', () => {
    // ① zh-CN 命中插件包（文案与迁移前宿主 locales 一致）
    expect(t('aiPanel.modeFast')).toBe('快速')
    expect(t('aiWord.title')).toBe('AI 生成词')

    // ② 切 en-US：命中英文表，且 {message} 插值生效
    const theme = useThemeStore()
    theme.setLocale('en-US')
    expect(t('aiWord.title')).toBe('AI Generated Words')
    expect(t('aiWord.error', { message: 'boom' })).toBe('Generation failed: boom')

    // ③ 回退链中段：构造「en 表缺失该 key」的偏斜包（与真实包走同一工厂），
    //    en-US 下应回退到插件包 zh-CN 表的中文文案
    const skewT = adapter.api.i18n.createT({
      'zh-CN': { aiWord: { title: 'AI 生成词' } },
      'en-US': {},
    })
    expect(skewT('aiWord.title')).toBe('AI 生成词')

    // ④ 两表均未命中 → 返回 key 本身（便于发现遗漏）
    expect(t('aiPanel.__missing__')).toBe('aiPanel.__missing__')
  })
})
