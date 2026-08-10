/**
 * 配色方案定义 — 重构后支持"主色调可切换"
 *
 * 架构：将"明暗模式"与"主色调"解耦为两个正交维度。
 *   modeSchemes —— 明暗中性色（背景、文本、边框等）
 *   accentSchemes —— 主色调（翡翠绿、经典蓝等），每个含 light/dark 两个变体
 *   combineScheme(mode, accent) —— 合并为完整 ColorScheme（消费方接口不变）
 *
 * CSS 变量分两组，变量名互不冲突，合并时直接展开。
 */

import type { GlobalTheme, GlobalThemeOverrides } from 'naive-ui'
import { darkTheme } from 'naive-ui'

// ============================================================
// 类型定义
// ============================================================

/** 画布 UI chrome 颜色集合（随主题变，绑定到 Konva config） */
export interface CanvasColors {
  /** 画布背景色 */
  background: string
  /** 节点文字色（随明暗主题，与主色无关） */
  nodeTextColor: string
  /** Transformer 选中框描边 */
  transformerBorder: string
  /** 框选矩形填充 */
  marqueeFill: string
  /** 框选矩形描边 */
  marqueeStroke: string
  /** 临时连线描边 */
  connectionTemp: string
  /** 选中连线描边 */
  connectionSelected: string
  /** 网格模式网格线颜色（半透明中性色） */
  gridLine: string
  /** 网格模式活动格高亮（主色系半透明） */
  activeGrid: string
}

/** 合并后的完整方案（消费方接口不变） */
export interface ColorScheme {
  id: string
  /** Naive UI 主题对象：null = 亮色，darkTheme = 深色 */
  theme: GlobalTheme | null
  /** Naive UI 组件级覆盖 */
  naiveOverrides: GlobalThemeOverrides
  /** 注入到 :root 的 CSS 变量 */
  cssVars: Record<string, string>
  /** Konva 画布 UI chrome 色 */
  canvas: CanvasColors
}

/** 明暗方案：仅中性色 + 画布背景（不含主色） */
export interface ModeScheme {
  id: 'light' | 'dark'
  theme: GlobalTheme | null
  /** 仅中性色变量（--color-bg / --color-surface / --color-text 等） */
  cssVars: Record<string, string>
  /** 画布中性色（背景 + 节点文字色，随明暗变，与主色无关） */
  canvas: { background: string; nodeTextColor: string }
}

/** 单个明暗变体下的主色配置 */
export interface AccentVariant {
  naiveOverrides: GlobalThemeOverrides
  /** 主色相关 CSS 变量（--color-primary / --color-primary-hover 等） */
  cssVars: Record<string, string>
  /** 主色相关画布色（不含 background 与 nodeTextColor，二者随明暗模式） */
  canvas: Omit<CanvasColors, 'background' | 'nodeTextColor'>
}

/** 主色调方案：含 light/dark 两个变体 */
export interface AccentScheme {
  id: string
  /** 显示名（中文，用于 UI） */
  name: string
  variants: { light: AccentVariant; dark: AccentVariant }
}

// ============================================================
// 明暗中性色方案
// ============================================================

export const modeSchemes: Record<'light' | 'dark', ModeScheme> = {
  light: {
    id: 'light',
    theme: null,
    cssVars: {
      '--color-bg': '#f3f4f6',
      '--color-surface': '#ffffff',
      '--color-border': '#d1d5db',
      '--color-text': '#1f2937',
      '--color-text-secondary': '#6b7280',
      '--color-text-muted': '#9ca3af',
      '--color-danger': '#ef4444',
      '--color-hover': 'rgba(0,0,0,0.04)',
      '--color-overlay': 'rgba(255,255,255,0.92)',
      '--color-overlay-border': 'rgba(0,0,0,0.1)',
      '--color-indent-line': 'rgba(0,0,0,0.08)',
      '--color-indent-line-strong': 'rgba(0,0,0,0.14)',
    },
    canvas: { background: '#f3f4f6', nodeTextColor: '#1f2937' },
  },
  dark: {
    id: 'dark',
    theme: darkTheme,
    cssVars: {
      '--color-bg': '#18181b',
      '--color-surface': '#27272a',
      '--color-border': '#3f3f46',
      '--color-text': '#e4e4e7',
      '--color-text-secondary': '#a1a1aa',
      '--color-text-muted': '#71717a',
      '--color-danger': '#f87171',
      '--color-hover': 'rgba(255,255,255,0.06)',
      '--color-overlay': 'rgba(0,0,0,0.75)',
      '--color-overlay-border': 'rgba(255,255,255,0.12)',
      '--color-indent-line': 'rgba(255,255,255,0.08)',
      '--color-indent-line-strong': 'rgba(255,255,255,0.14)',
    },
    canvas: { background: '#212020', nodeTextColor: '#e4e4e7' },
  },
}

// ============================================================
// 主色调方案
// ============================================================

/** 翡翠绿（默认主色调） */
const emerald: AccentScheme = {
  id: 'emerald',
  name: '翡翠绿',
  variants: {
    light: {
      naiveOverrides: {
        common: {
          primaryColor: '#10b981',
          primaryColorHover: '#34d399',
          primaryColorPressed: '#059669',
          primaryColorSuppl: '#10b981',
        },
      },
      cssVars: {
        '--color-primary': '#10b981',
        '--color-primary-hover': '#34d399',
        '--color-primary-pressed': '#059669',
        '--color-on-primary': '#ffffff',
        '--color-active-bg': 'rgba(16,185,129,0.12)',
        '--color-active-border': 'rgba(16,185,129,0.5)',
        '--color-selected-ring': '#10b981',
        '--color-primary-faint': 'rgba(16,185,129,0.1)',
        '--color-primary-soft': 'rgba(16,185,129,0.2)',
      },
      canvas: {
        transformerBorder: '#10b981',
        marqueeFill: 'rgba(16,185,129,0.15)',
        marqueeStroke: '#10b981',
        connectionTemp: '#10b981',
        connectionSelected: '#10b981',
        gridLine: 'rgba(0,0,0,0.10)',
        activeGrid: 'rgba(16,185,129,0.25)',
      },
    },
    dark: {
      naiveOverrides: {
        common: {
          primaryColor: '#34d399',
          primaryColorHover: '#6ee7b7',
          primaryColorPressed: '#10b981',
          primaryColorSuppl: '#34d399',
        },
      },
      cssVars: {
        '--color-primary': '#34d399',
        '--color-primary-hover': '#6ee7b7',
        '--color-primary-pressed': '#10b981',
        '--color-on-primary': '#ffffff',
        '--color-active-bg': 'rgba(52,211,153,0.16)',
        '--color-active-border': 'rgba(52,211,153,0.5)',
        '--color-selected-ring': '#34d399',
        '--color-primary-faint': 'rgba(52,211,153,0.1)',
        '--color-primary-soft': 'rgba(52,211,153,0.2)',
      },
      canvas: {
        transformerBorder: '#34d399',
        marqueeFill: 'rgba(52,211,153,0.2)',
        marqueeStroke: '#34d399',
        connectionTemp: '#34d399',
        connectionSelected: '#34d399',
        gridLine: 'rgba(255,255,255,0.10)',
        activeGrid: 'rgba(52,211,153,0.25)',
      },
    },
  },
}

/** 经典蓝（从旧 colorSchemes 提取，保持不变） */
const blue: AccentScheme = {
  id: 'blue',
  name: '经典蓝',
  variants: {
    light: {
      naiveOverrides: {
        common: {
          primaryColor: '#3b82f6',
          primaryColorHover: '#60a5fa',
          primaryColorPressed: '#2563eb',
          primaryColorSuppl: '#3b82f6',
        },
      },
      cssVars: {
        '--color-primary': '#3b82f6',
        '--color-primary-hover': '#60a5fa',
        '--color-primary-pressed': '#2563eb',
        '--color-on-primary': '#ffffff',
        '--color-active-bg': 'rgba(59,130,246,0.12)',
        '--color-active-border': 'rgba(59,130,246,0.5)',
        '--color-selected-ring': '#3b82f6',
        '--color-primary-faint': 'rgba(59,130,246,0.1)',
        '--color-primary-soft': 'rgba(59,130,246,0.2)',
      },
      canvas: {
        transformerBorder: '#3b82f6',
        marqueeFill: 'rgba(59,130,246,0.15)',
        marqueeStroke: '#3b82f6',
        connectionTemp: '#3b82f6',
        connectionSelected: '#3b82f6',
        gridLine: 'rgba(0,0,0,0.10)',
        activeGrid: 'rgba(59,130,246,0.25)',
      },
    },
    dark: {
      naiveOverrides: {
        common: {
          primaryColor: '#60a5fa',
          primaryColorHover: '#93c5fd',
          primaryColorPressed: '#3b82f6',
          primaryColorSuppl: '#60a5fa',
        },
      },
      cssVars: {
        '--color-primary': '#60a5fa',
        '--color-primary-hover': '#93c5fd',
        '--color-primary-pressed': '#3b82f6',
        '--color-on-primary': '#ffffff',
        '--color-active-bg': 'rgba(96,165,250,0.16)',
        '--color-active-border': 'rgba(96,165,250,0.5)',
        '--color-selected-ring': '#60a5fa',
        '--color-primary-faint': 'rgba(96,165,250,0.1)',
        '--color-primary-soft': 'rgba(96,165,250,0.2)',
      },
      canvas: {
        transformerBorder: '#60a5fa',
        marqueeFill: 'rgba(96,165,250,0.2)',
        marqueeStroke: '#60a5fa',
        connectionTemp: '#60a5fa',
        connectionSelected: '#60a5fa',
        gridLine: 'rgba(255,255,255,0.10)',
        activeGrid: 'rgba(96,165,250,0.25)',
      },
    },
  },
}

export const accentSchemes = {
  emerald,
  blue,
} as const

/** 主色调 ID 类型 */
export type AccentSchemeId = keyof typeof accentSchemes

// ============================================================
// 合并函数
// ============================================================

/**
 * 合并明暗模式 + 主色调为完整 ColorScheme
 *
 * @param mode  - 'light' | 'dark'
 * @param accent - 主色调 id（'emerald' | 'blue'）
 * @returns 完整 ColorScheme（id 为 `${accent}-${mode}`，如 'emerald-light'）
 */
export function combineScheme(mode: 'light' | 'dark', accent: AccentSchemeId): ColorScheme {
  const modeScheme = modeSchemes[mode]
  const accentVariant = accentSchemes[accent].variants[mode]

  return {
    id: `${accent}-${mode}`,
    theme: modeScheme.theme,
    naiveOverrides: accentVariant.naiveOverrides,
    cssVars: {
      ...modeScheme.cssVars,
      ...accentVariant.cssVars,
    },
    canvas: {
      background: modeScheme.canvas.background,
      nodeTextColor: modeScheme.canvas.nodeTextColor,
      transformerBorder: accentVariant.canvas.transformerBorder,
      marqueeFill: accentVariant.canvas.marqueeFill,
      marqueeStroke: accentVariant.canvas.marqueeStroke,
      connectionTemp: accentVariant.canvas.connectionTemp,
      connectionSelected: accentVariant.canvas.connectionSelected,
      gridLine: accentVariant.canvas.gridLine,
      activeGrid: accentVariant.canvas.activeGrid,
    },
  }
}
