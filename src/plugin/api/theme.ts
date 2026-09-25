/**
 * api/theme.ts —— 主题域：亮/暗模式与配色方案读写，接口类型由实现派生。
 * 主题为纯 UI 状态（不入 undo 历史）故切换不带 user；`scheme()` 返回组合后的完整配色方案（只读）。
 */
import type { ColorScheme, AccentSchemeId } from '@/config/colorSchemes'
import { useThemeStore } from '@/stores/theme'

export function createThemeApi() {
  const api = {
    /** 当前主题模式：'light' | 'dark' */
    mode(): 'light' | 'dark' {
      return useThemeStore().mode as 'light' | 'dark'
    },
    /** 是否暗色模式 */
    isDark(): boolean {
      return useThemeStore().isDark
    },
    /** 当前主色调 id */
    accentId(): AccentSchemeId {
      return useThemeStore().accentId
    },
    /** 当前配色方案 id（mode + accent 组合） */
    schemeId(): string {
      return useThemeStore().schemeId
    },
    /** 完整配色方案（只读快照） */
    scheme(): ColorScheme {
      return useThemeStore().scheme
    },
    /** 切换亮 / 暗 */
    toggle(): void {
      useThemeStore().toggle()
    },
    /** 显式设置主题模式 */
    setMode(target: 'light' | 'dark'): void {
      useThemeStore().setMode(target)
    },
    /** 设置主色调 */
    setAccent(id: AccentSchemeId): void {
      useThemeStore().setAccent(id)
    },
  }
  return api
}

export type ThemeApi = ReturnType<typeof createThemeApi>