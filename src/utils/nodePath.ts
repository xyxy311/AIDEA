/**
 * 节点路径 - 纯函数层
 *
 * 用于展示节点所在层级路径：
 * - 传入「不含根的名字数组」（根 → 最近父、不含目标自身、不含根名），
 *   根用前导 "/" 表示（不显示项目根名），格式如 `/节点1/节点2`；根的
 *   直接子级路径显示为 `/`。
 * - 因面板宽度有限，长路径需"保尾截断"：只保留头部根部几段与尾部最近几段，
 *   中间以省略号折叠，避免路径溢出。
 *
 * 本文件只包含纯函数，不依赖 store，便于单测与复用。
 */

/** 祖先名列表拼接为 '/' 分隔路径字符串（不带前导 "/"，供 join 后可再拼） */
export function joinPathNames(names: string[]): string {
  return names.join('/')
}

/**
 * 保尾截断：当 segment 数量超过 keepRoot + keepTail 时，
 * 保留头部 keepRoot 项 + 尾部 keepTail 项，中间以 ellipsis('…') 折叠；
 * 不足时原样返回（不变形）。
 */
export function truncatePathSegments(
  segments: string[],
  keepRoot = 1,
  keepTail = 2,
  ellipsis = '…',
): string[] {
  if (segments.length <= keepRoot + keepTail) {
    return [...segments]
  }
  return [...segments.slice(0, keepRoot), ellipsis, ...segments.slice(-keepTail)]
}

/**
 * 生成展示路径与完整路径。
 *
 * @param ancestorNames 不含根的名字数组（根 → 最近父；不含目标自身、不含根名）。
 *                      根用前导 "/" 表示；数组为空表示根的直接子级 → 返回 "/"。
 * @returns display 为截断段拼接（头部 keepRoot 段 + 尾部 keepTail 段），
 *                 full 为完整拼接；两者均以 "/" 开头。
 */
export function buildDisplayPath(
  ancestorNames: string[],
  opts?: { keepRoot?: number; keepTail?: number },
): { display: string; full: string } {
  const keepRoot = opts?.keepRoot ?? 1
  const keepTail = opts?.keepTail ?? 2
  const displaySegs = truncatePathSegments(ancestorNames, keepRoot, keepTail)
  return {
    display: '/' + joinPathNames(displaySegs),
    full: '/' + joinPathNames(ancestorNames),
  }
}