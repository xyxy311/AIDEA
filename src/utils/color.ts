/**
 * 颜色解析与派生工具
 *
 * 用于节点背景色派生：根据边框颜色（用户可调，可能含透明度）
 * 与当前主题（亮/暗）自动计算背景色——保持色相、调整亮度，
 * 并继承边框色的透明度，使背景与边框透明度始终一致。
 */

/** RGBA 颜色对象（r/g/b 为 0-255，a 为 0-1） */
export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

/** HSL 颜色对象（h 为 0-360，s/l 为 0-1） */
export interface HSL {
  h: number
  s: number
  l: number
}

/**
 * 解析颜色字符串为 RGBA。
 * 支持 #rgb / #rrggbb / #rrggbbaa / rgb(r,g,b) / rgba(r,g,b,a)。
 * 无法解析时回退为不透明黑色。
 */
export function parseColor(input: string): RGBA {
  const str = input.trim().toLowerCase()

  // #rrggbbaa / #rrggbb / #rgb
  const hexMatch = str.match(/^#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})$/)
  if (hexMatch) {
    let hex = hexMatch[1]
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('')
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      }
    }
    // length === 8
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: parseInt(hex.slice(6, 8), 16) / 255,
    }
  }

  // rgb() / rgba()
  const rgbMatch = str.match(/^rgba?\(([^)]+)\)$/)
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((p) => p.trim())
    const a = parts.length >= 4 ? parseFloat(parts[3]) : 1
    return {
      r: parseFloat(parts[0]),
      g: parseFloat(parts[1]),
      b: parseFloat(parts[2]),
      a: Number.isNaN(a) ? 1 : a,
    }
  }

  // 回退：不透明黑
  return { r: 0, g: 0, b: 0, a: 1 }
}

/** RGB(0-255) -> HSL */
export function rgbToHsl(r: number, g: number, b: number): HSL {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0)
        break
      case gn:
        h = (bn - rn) / d + 2
        break
      default:
        h = (rn - gn) / d + 4
    }
    h *= 60
  }
  return { h, s, l }
}

/** HSL -> RGB（返回 0-255 整数） */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hn = ((((h % 360) + 360) % 360) / 360)
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hueToRgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const r = hueToRgb(p, q, hn + 1 / 3)
  const g = hueToRgb(p, q, hn)
  const b = hueToRgb(p, q, hn - 1 / 3)
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
}

/** 将 RGBA 转为 rgba() 字符串 */
export function rgbaToString(c: RGBA): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a})`
}

/**
 * 根据边框颜色派生节点背景色。
 *
 * 规则：
 * - 保持边框色的色相（h）
 * - 亮色主题：亮度提升至 0.95（极浅），饱和度上限 0.45
 * - 暗色主题：亮度降至 0.16（深色），饱和度上限 0.35
 * - 继承边框色的透明度（alpha），保证背景与边框透明度一致
 *
 * @param borderColor 边框颜色（支持 #hex / #hex8 / rgba()）
 * @param isDark      是否暗色主题
 * @returns 派生的背景色 rgba() 字符串
 */
export function deriveBackgroundColor(borderColor: string, isDark: boolean): string {
  const { r, g, b, a } = parseColor(borderColor)
  const { h, s } = rgbToHsl(r, g, b)
  const newL = isDark ? 0.16 : 0.95
  const newS = isDark ? Math.min(s, 0.35) : Math.min(s, 0.45)
  const rgb = hslToRgb(h, newS, newL)
  return rgbaToString({ r: rgb.r, g: rgb.g, b: rgb.b, a })
}

/**
 * 计算在给定背景色上可读的文字颜色（深 / 浅）。
 *
 * 标签胶囊背景为数据色（Tag.color，不随主题），其内部文字需要根据背景亮度
 * 选择深色或浅色以保证对比度。基于 WCAG 相对亮度（sRGB 线性化）判断：
 * 背景较亮 → 深色文字；背景较暗 → 浅色文字。
 *
 * @param bgColor 背景颜色（支持 #hex / #hex8 / rgba()）
 * @returns 深色文字 '#1f2937' 或浅色文字 '#ffffff'
 */
export function getContrastTextColor(bgColor: string): string {
  const { r, g, b } = parseColor(bgColor)
  const srgb = (c: number): number => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
  // 阈值 0.5：亮度超过则用深色文字，否则用浅色
  return luminance > 0.5 ? '#1f2937' : '#ffffff'
}
