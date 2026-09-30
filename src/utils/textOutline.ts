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