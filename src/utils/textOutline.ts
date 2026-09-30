/**
 * textOutline —— 把节点树深度优先展开为「制表符缩进」的纯文本大纲（导出为文本用）。
 * 纯函数：不依赖 store，便于单测与复用。
 */

export interface OutlineSource {
  /** 取某节点文本；返回 undefined 表示节点不存在（跳过该行，防御性） */
  textOf(id: string): string | undefined
  /** 取某节点的直接子节点 id 列表 */
  childrenOf(id: string): string[]
}

/**
 * 深度优先收集：根节点缩进 0，每深入一层前缀一个 \t。
 * @param rootId 根节点 id
 */
export function buildTextOutline(rootId: string, src: OutlineSource): string {
  const lines: string[] = []
  const visit = (id: string, depth: number): void => {
    const text = src.textOf(id)
    if (text === undefined) {
      // 节点缺失：跳过该行但仍递归其子树（防御性）
      for (const childId of src.childrenOf(id)) visit(childId, depth + 1)
      return
    }
    // 多行文本：每行都加缩进，避免续行与缩进错位
    const indent = '\t'.repeat(depth)
    for (const line of text.split('\n')) lines.push(indent + line)
    for (const childId of src.childrenOf(id)) visit(childId, depth + 1)
  }
  visit(rootId, 0)
  return lines.join('\n')
}

// ── 解析（逆操作：从缩进文本构建节点森林，供「从文本插入」）──

/** 解析结果中的单个节点（子树嵌套在 children） */
export interface OutlineTextNode {
  text: string
  children: OutlineTextNode[]
}

/** 拆分行首缩进：制表符 = 1 级，两个空格 = 1 级（导出默认用制表符） */
function splitIndent(line: string): { level: number; text: string } {
  const m = /^([\t ]+)/.exec(line)
  const indent = m ? m[0] : ''
  let level = 0
  for (const ch of indent) level += ch === '\t' ? 1 : 0.5
  return { level: Math.round(level), text: line.slice(indent.length) }
}

/**
 * 把制表符缩进的文本解析为节点森林（允许多个 0 缩进根）。
 * 空行忽略；每行的缩进决定层级，父子关系按深度栈重建。
 */
export function parseTextForest(content: string): OutlineTextNode[] {
  const forest: OutlineTextNode[] = []
  // 深度栈：元素 = { 该层节点, 它在文本里的缩进级 }；栈顶即当前可挂父级
  const stack: { node: OutlineTextNode; level: number }[] = []
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '')
    if (line.trim() === '') continue
    const { level, text } = splitIndent(line)
    // 弹出层级 ≥ 当前的行（同缩进 = 兄弟），剩下栈顶即父级
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop()
    const parent = stack.length > 0 ? stack[stack.length - 1].node : null
    const node: OutlineTextNode = { text, children: [] }
    if (parent) parent.children.push(node)
    else forest.push(node)
    stack.push({ node, level })
  }
  return forest
}

// ── 布局（插入节点时的整齐排布）──

/** 节点间距步长（固定）：列间距 / 行间距 */
export const TEXT_LEVEL_H_STEP = 280
export const TEXT_LEVEL_V_STEP = 160

/** 布局后的节点（克隆自 OutlineTextNode，附加相对坐标 x/y） */
export interface PlacedTextNode {
  text: string
  x: number
  y: number
  children: PlacedTextNode[]
}

/**
 * 把解析出的节点森林按「深度分层」排成网格，返回带相对坐标的树。
 * 每层节点数 n 时：行内节点数（列数）= floor(√n)，行数 = ceil(n / 列数)；
 * 各层纵向依次堆叠（层间互不重叠），层内网格间距固定。
 */
export function layoutTextNodes(forest: OutlineTextNode[]): PlacedTextNode[] {
  // 按深度收集（保持 DFS 序）；byDepth[d] 即第 d 层全部节点
  const byDepth: OutlineTextNode[][] = []
  const collect = (nodes: OutlineTextNode[], depth: number): void => {
    for (const n of nodes) {
      (byDepth[depth] ??= []).push(n)
      collect(n.children, depth + 1)
    }
  }
  collect(forest, 0)

  // 先为每个节点分配（相对）坐标占位，再按层级堆叠
  const placed = new Map<OutlineTextNode, PlacedTextNode>()
  let cursorY = 0
  for (const level of byDepth) {
    const cols = Math.max(1, Math.floor(Math.sqrt(level.length)))
    const rows = Math.ceil(level.length / cols)
    level.forEach((n, i) => {
      placed.set(n, {
        text: n.text,
        x: (i % cols) * TEXT_LEVEL_H_STEP,
        y: cursorY + Math.floor(i / cols) * TEXT_LEVEL_V_STEP,
        children: [],
      })
    })
    cursorY += rows * TEXT_LEVEL_V_STEP
  }

  // 重建树形引用
  const link = (nodes: OutlineTextNode[]): PlacedTextNode[] =>
    nodes.map((n) => {
      const p = placed.get(n)!
      p.children = link(n.children)
      return p
    })
  return link(forest)
}