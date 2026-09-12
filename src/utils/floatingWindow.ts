/**
 * floatingWindow —— 浮动窗口越界钳制（纯函数，供 common/FloatingWindow.vue 使用）
 *
 * 背景：浮动窗口 Teleport to body + fixed 定位，程序边界 = 视口（window.innerWidth/innerHeight）。
 * 拖动偏移不做约束时窗口可被完全拖出视口，导致无法触及内容（含插件自备的关闭入口）。
 * 本模块把「窗口始终完整落在视口内」的约束抽为纯函数：输入视口与窗口尺寸及当前偏移，
 * 输出钳制后的偏移；不依赖 DOM / store，便于单测穷举边界。
 */

/**
 * 计算某轴的钳制偏移（内部辅助）。
 *
 * 定位模型（与 FloatingWindow.vue 的 transform 一致）：
 *   窗口中心 = 视口中心 + offset，即 fixed + left/top 50% +
 *   transform: translate(calc(-50% + x), calc(-50% + y))
 *   → 窗口矩形 left = vw/2 + ox - w/2，top = vh/2 + oy - h/2。
 *
 * 「窗口完整落在视口内」（左/上 ≥ 0 且右/下 ≤ vw/vh）等价于该轴偏移满足：
 *   ox ∈ [(w - vw)/2, (vw - w)/2]
 *
 * @param viewport 该轴视口尺寸（px）
 * @param size     该轴窗口尺寸（px）
 * @param offset   该轴当前偏移（px）
 * @returns 钳制后的该轴偏移（px）
 */
function clampAxis(viewport: number, size: number, offset: number): number {
  // 约束区间下界（窗口左/上缘贴视口 0 时的偏移）与上界（右/下缘贴视口边时的偏移）
  const min = (size - viewport) / 2
  const max = (viewport - size) / 2
  // 窗口某轴尺寸大于视口：min > max 区间颠倒，该轴无法完整容纳 → 退化为居中（0），
  // 保证窗口中心区域始终在视口内可触及（size === viewport 时 min === max === 0，自然居中）
  if (min > max) return 0
  return Math.min(max, Math.max(min, offset))
}

/**
 * 浮动窗口拖动偏移的越界钳制（纯函数）。
 *
 * 输入视口 / 窗口尺寸与当前偏移，输出钳制后的偏移——约束为「窗口完整落在视口内」，
 * 保证关闭入口（由插件内容自备）始终可被用户触及。
 *
 * 退化行为：
 * - 某轴窗口尺寸 ≥ 视口尺寸（min > max 颠倒）→ 该轴取 0（居中）；
 * - 窗口尺寸为 0（如 jsdom/happy-dom 无布局引擎，offsetWidth = 0）→ 约束区间为
 *   ±视口/2，实际不构成限制（自然语义，无需特判）。
 *
 * @param vw 视口宽（window.innerWidth）
 * @param vh 视口高（window.innerHeight）
 * @param w  窗口宽（offsetWidth）
 * @param h  窗口高（offsetHeight）
 * @param ox 当前 X 偏移（CSS 变量 --float-x 的值）
 * @param oy 当前 Y 偏移（CSS 变量 --float-y 的值）
 * @returns 钳制后的偏移 { x, y }
 */
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
