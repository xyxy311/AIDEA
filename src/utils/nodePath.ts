/**
 * 节点展示路径纯函数层。
 * 输入为不含根/目标自身的名字数组（根用前导 "/"），长路径做"保尾截断"折叠防止溢出。
 */

/** 祖先名列表拼接为 '/' 分隔路径字符串（不带前导 "/"，供 join 后可再拼） */
export function joinPathNames(names: string[]): string {
  return names.join('/')
}

/** 保尾截断：段数超过 keepRoot+keepTail 时保留头尾、中间以省略号折叠，不足则原样返回 */
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

/** 生成展示路径与完整路径：display 为截断段拼接，full 为完整拼接，均以 "/" 开头 */
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