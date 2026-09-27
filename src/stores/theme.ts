/**
 * themeStore —— 主题状态管理（亮/暗 + 主色调 + 界面语言）。单一数据源 drive Naive UI / CSS 变量(:root) / Konva 画布三处。
 * mode 持久化到 localStorage('aidea-theme')，仅 light/dark；accentId 存 'aidea-accent'（默认 emerald）；locale 存 'aidea-locale'。
 */
import { computed, watchEffect } from 'vue'
import { defineStore } from 'pinia'
import { useColorMode, useStorage } from '@vueuse/core'
import { modeSchemes, accentSchemes, combineScheme, type ColorScheme, type AccentSchemeId } from '@/config/colorSchemes'
import { DEFAULT_LOCALE } from '@/constants/locale'
import type { LocaleId } from '@/types/locale'

export const useThemeStore = defineStore('theme', () => {
  // useColorMode: 持久化到 localStorage('aidea-theme')，attribute 设到 <html data-theme="...">
  // initialValue 'light' = 默认浅色；modes 仅 light/dark 两态，不引入 'auto'。
  const mode = useColorMode({
    storageKey: 'aidea-theme',
    attribute: 'data-theme',
    initialValue: 'light',
    modes: { light: 'light', dark: 'dark' },
  })

  const isDark = computed(() => mode.value === 'dark')

  /** 主色调 ID，持久化到 localStorage('aidea-accent')，默认 'emerald' */
  const accentId = useStorage<AccentSchemeId>('aidea-accent', 'emerald')

  /** 界面语言，持久化到 localStorage('aidea-locale')，默认 DEFAULT_LOCALE（zh-CN）；useT 读取该值决定文案来源 */
  const locale = useStorage<LocaleId>('aidea-locale', DEFAULT_LOCALE)

  const scheme = computed<ColorScheme>(() =>
    combineScheme(mode.value === 'dark' ? 'dark' : 'light', accentId.value),
  )

  const schemeId = computed(() => scheme.value.id)

  // 将当前方案的 CSS 变量注入 :root，覆盖 main.css 中移除的颜色变量
  watchEffect(() => {
    const root = document.documentElement
    for (const [key, value] of Object.entries(scheme.value.cssVars)) {
      root.style.setProperty(key, value)
    }
  })

  /** 切换亮/暗 */
  function toggle(): void {
    mode.value = isDark.value ? 'light' : 'dark'
  }

  /** 显式设置模式 */
  function setMode(target: 'light' | 'dark'): void {
    mode.value = target
  }

  /** 设置主色调 */
  function setAccent(id: AccentSchemeId): void {
    accentId.value = id
  }

  /** 设置界面语言（仅赋值，无副作用；文案热更新由 useT 对 locale 的响应式读取驱动） */
  function setLocale(id: LocaleId): void {
    locale.value = id
  }

  return {
    mode,
    accentId,
    locale,
    isDark,
    scheme,
    schemeId,
    toggle,
    setMode,
    setAccent,
    setLocale,
  }
})
