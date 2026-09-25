/**
 * floatingWindow —— 浮动窗口越界钳制（纯函数）：窗口 Teleport to body + fixed 定位，
 * 拖离视口会不可触达；输入视口/窗口尺寸与偏移，输出钳制后偏移保证窗口完整落在视口内。
 */

/**
 * 计算单轴钳制偏移（内部辅助）。
 * 窗口中心 = 视口中心 + offset；「窗口完整落在视口内」等价于 ox ∈ [(size-vw)/2, (vw-size)/2]。
 */
function clampAxis(viewport: number, size: number, offset: number): number {
  const min = (size - viewport) / 2
  const max = (viewport - size) / 2
  // 窗口尺寸 ≥ 视口时区间颠倒，无法完整容纳 → 退化为居中（0），保证中心区域可触及
  if (min > max) return 0
  return Math.min(max, Math.max(min, offset))
}

/** 浮动窗口拖动偏移越界钳制：保证窗口完整落在视口内、关闭入口始终可触及。 */
export function clampFloatingOffset(
  vw: number,
  vh: number,
  w: number,
  h: number,
  ox: number,
  oy: number,
): { x: number; y: number } {
  return {
    x: clampAxis(vw, w, ox),
    y: clampAxis(vh, h, oy),
  }
}
