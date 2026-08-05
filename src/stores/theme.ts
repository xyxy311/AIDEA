/**
 * themeStore - 主题状态管理
 *
 * 管理亮/暗模式 + 主色调切换，单一数据源驱动三处：
 *   1. Naive UI：App.vue 的 n-config-provider 读取 scheme.theme / scheme.naiveOverrides
 *   2. CSS 变量：watchEffect 将 scheme.cssVars 注入 :root，自定义组件 var(--color-*) 自动响应
 *   3. Konva 画布：组件读取 scheme.canvas.* 绑定到 Konva config，响应式重绘
 *
 * 持久化：
 *   - mode：useColorMode 内置 localStorage（key: 'aidea-theme'），仅 light/dark 两态手动切换
 *   - accentId：useStorage 持久化到 localStorage（key: 'aidea-accent'），默认 'emerald'
 */
import { computed, watchEffect } from 'vue'
import { defineStore } from 'pinia'
import { useColorMode, useStorage } from '@vueuse/core'
import { modeSchemes, accentSchemes, combineScheme, type ColorScheme, type AccentSchemeId } from '@/config/colorSchemes'

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

  return {
    mode,
    accentId,
    isDark,
    scheme,
    schemeId,
    toggle,
    setMode,
    setAccent,
  }
})
