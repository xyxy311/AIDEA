/**
 * mcp/naming.ts —— MCP 读侧命名纯函数（零 store 依赖）。
 * 句柄 / 显示名 / 颜色归一化 / 预设名匹配：读与写共用同一套词汇（plan/Agent-MCP读接口改版方案.md §5）。
 */

/** 取文本首行（trim；空文本 → ''） */
export function firstLineOf(text: string): string {
  return (text.split('\n')[0] ?? '').trim()
}

/**
 * 显示标签：
 * - first 模式（默认）：取首行（或 displayName 覆盖），超 maxChars 截断加 '…'，多行追加 ' (+K行)'；
 * - full 模式：全文 '\n' 转义，超长截断加 '…(+K字)'；
 * - 空文本 → '(空)'。
 */
export function displayLabel(
  text: string,
  opts: { full: boolean; maxChars: number; displayName?: string },
): string {
  if (text.trim() === '') return '(空)'
  if (opts.full) {
    const escaped = text.replace(/\n/g, '\\n')
    if (escaped.length <= opts.maxChars) return escaped
    return `${escaped.slice(0, opts.maxChars)}…(+${escaped.length - opts.maxChars}字)`
  }
  const name = opts.displayName ?? firstLineOf(text)
  const extraLines = text.split('\n').length - 1
  const base = name.length > opts.maxChars ? `${name.slice(0, opts.maxChars)}…` : name
  return extraLines > 0 ? `${base} (+${extraLines}行)` : base
}

/**
 * 句柄分配：id → 最短唯一前缀（不含 'N'）；从 3 位起，冲突加长；同输入必得同输出。
 */
export function assignNodeHandles(ids: readonly string[]): Map<string, string> {
  const handles = new Map<string, string>()
  const MIN = 3
  const maxLen = ids.reduce((m, id) => Math.max(m, id.length), MIN)
  for (let len = MIN; handles.size < ids.length && len <= maxLen; len++) {
    const counts = new Map<string, number>()
    for (const id of ids) {
      if (handles.has(id)) continue
      const prefix = id.slice(0, len)
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
    }
    for (const id of ids) {
      if (handles.has(id)) continue
      const prefix = id.slice(0, len)
      if (counts.get(prefix) === 1) handles.set(id, prefix)
    }
  }
  // 兜底（理论不达：完整 id 必唯一）
  for (const id of ids) if (!handles.has(id)) handles.set(id, id)
  return handles
}

/** 同视图（兄弟集）内同名 → 追加 (2)(3)，按输入顺序确定性分配 */
export function uniqueDisplayNames(labels: Map<string, string>): Map<string, string> {
  const used = new Map<string, number>()
  const out = new Map<string, string>()
  for (const [id, label] of labels) {
    const seen = used.get(label) ?? 0
    used.set(label, seen + 1)
    out.set(id, seen === 0 ? label : `${label}(${seen + 1})`)
  }
  return out
}

/** 颜色归一化（仅呈现层比较用）：小写、#ffffffff ≡ #ffffff */
export function normalizeHex(hex: string): string {
  const v = hex.trim().toLowerCase()
  if (/^#[0-9a-f]{8}$/.test(v) && v.endsWith('ff')) return v.slice(0, 7)
  return v
}

export interface NodePresetLike {
  name: string
  borderColor: string
}

/** 颜色 → 节点预设名；未命中 null；同色多预设 → 首个命中名 + '(=name2)' 标注 */
export function presetNameOf(value: string, presets: readonly NodePresetLike[]): string | null {
  const target = normalizeHex(value)
  const hits = presets.filter((p) => normalizeHex(p.borderColor) === target)
  if (hits.length === 0) return null
  if (hits.length === 1) return hits[0].name
  return `${hits[0].name} (=${hits.slice(1).map((p) => p.name).join('=')})`
}
