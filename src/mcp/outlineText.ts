/**
 * mcp/outlineText.ts —— MCP 索引层大纲文本（§4.4）。
 * 输入是已展开的 children 树（不读 store）；规则：容器行带 (+K 子, +L 叶)，
 * 叶子默认只计数不列行，"全叶子退化"时列前 leafPreview 个叶子名；不输出坐标。
 */

export interface OutlineEntry {
  id: string
  /** 短句柄码（不含 'N' 前缀） */
  handle: string
  label: string
  tagNames: string[]
  styleName: string | null
  /** 插件扩展键名（includeAdditions 开启时由调用方填充；只列键名，值形状未知） */
  additionKeys: string[]
  childCount: number
  /** 全子树叶节点数（不受 depth 截断影响） */
  leafCount: number
  /** 仅在 depth 内展开 */
  children: OutlineEntry[]
}

export interface OutlineOpts {
  depth: number
  limit: number
  leafPreview: number
  /** 头行路径（'/Project/Node'）；缺省用根条目名 */
  titlePath?: string
}

export function buildOutline(
  root: OutlineEntry,
  opts: OutlineOpts,
): { text: string; truncated: boolean } {
  const lines: string[] = []
  let truncated = false
  let budget = opts.limit

  const slots = (e: OutlineEntry): string => {
    const parts: string[] = []
    if (e.tagNames.length > 0) parts.push(e.tagNames.join('+'))
    if (e.styleName) parts.push(e.styleName)
    if (e.additionKeys.length > 0) parts.push(...e.additionKeys)
    return parts.length > 0 ? ` | ${parts.join(' | ')}` : ''
  }
  const countSuffix = (e: OutlineEntry): string =>
    e.childCount > 0 ? ` (+${e.childCount} 子, +${e.leafCount} 叶)` : ''

  const put = (line: string): void => {
    if (budget <= 0) {
      truncated = true
      return
    }
    budget--
    lines.push(line)
  }

  /** 深度优先列行：容器按序展开；某父的子节点全部是叶子时列前 leafPreview 个（防"整棵退化成空"） */
  const walk = (e: OutlineEntry, depthLeft: number, indent: string): void => {
    if (depthLeft <= 0 || e.children.length === 0) return
    const allLeaves = e.children.every((c) => c.childCount === 0)
    const listed = allLeaves ? e.children.slice(0, opts.leafPreview) : e.children.filter((c) => c.childCount > 0)
    for (const c of listed) {
      put(`${indent}N${c.handle} ${c.label}${slots(c)}${countSuffix(c)}`)
      walk(c, depthLeft - 1, `${indent}  `)
      if (truncated) return
    }
  }

  lines.push(`OUTLINE ${opts.titlePath ?? root.label}  (深度 ${opts.depth} · ${opts.limit} 行上限)`)
  put(`ROOT N${root.handle} ${root.label}${slots(root)}${countSuffix(root)}`)
  walk(root, opts.depth, '  ')
  if (truncated) lines.push(`… (+未显示行；用 rootId 参数下钻)`)

  return { text: lines.join('\n'), truncated }
}
