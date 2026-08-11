/**
 * 视图转文本 - 把"视图节点"按空间位置编排成格式化文本
 *
 * 目的：帮助 AI / 其它上下文函数理解项目内容（把节点的二维布局降维成有结构的文本）。
 * 只读节点几何与文本，不触碰任何写路径、不依赖 store，纯函数可单测。
 *
 * 架构：策略模式 + 算法注册表
 * - 每个算法是"自带参数 schema + 构建函数"的自描述对象（ViewTextAlgorithm）。
 * - 面板 / 调用方只读注册表（VIEW_TEXT_ALGORITHMS），动态渲染算法下拉与参数控件，
 *   调用统一调度器 buildViewText。
 * - 新增算法只需在注册表追加一个 ViewTextAlgorithm 对象，外部零改动。
 *
 * 当前实现算法：
 * - rowCluster（方案A）：y 重叠贪心聚行。节点按 y 升序，与已有行的纵向区间
 *   重叠（含 tolerance 容差）则并入该行并扩展区间，否则新建行；行内按 x 排序。
 *   每个节点恰好出现一次，无去重歧义、无步长魔法参数。
 */
import type { WhiteboardNode } from '@/types'

/** 算法输入节点：仅需几何与首行/文本，隔离 store 依赖 */
export type ViewTextNode = Pick<WhiteboardNode, 'id' | 'x' | 'y' | 'width' | 'height' | 'text'>

/** 参数类型：数字 / 布尔 / 枚举选择 */
export type ViewTextParamType = 'number' | 'boolean' | 'select'

/** 算法参数 schema：面板据此动态渲染控件 */
export interface ViewTextParamSchema {
  /** 参数名（build 的 params 字典 key） */
  key: string
  /** 参数显示名 i18n key */
  labelKey: string
  type: ViewTextParamType
  /** 默认值（number / boolean / select 的 value） */
  default: number | boolean | string
  /** number 类型：范围与步长 */
  min?: number
  max?: number
  step?: number
  /** select 类型：选项 */
  options?: Array<{ labelKey: string; value: string }>
}

/** 算法定义：自描述，供面板动态渲染与调度器分发 */
export interface ViewTextAlgorithm {
  id: string
  /** 算法显示名 i18n key */
  labelKey: string
  /** 输出形态：rows=二维行式(每行多单元格) / list=扁平列表式(每项一行) */
  output: 'rows' | 'list'
  /** 参数 schema 列表 */
  params: ViewTextParamSchema[]
  build(nodes: ViewTextNode[], params: Record<string, unknown>): string[][] | string[]
}

/** 取节点文本的首行（去掉前导/尾随空白），作为单行描述 */
function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? ''
  return line.trim()
}

/** 行式二维结构 → 字符串：行内用 separator 拼接，行间用 '\n' */
export function formatRows(rows: string[][], separator: string): string {
  return rows.map((row) => row.join(separator)).join('\n')
}

/** 扁平列表 → 字符串：每项一行('\n' 拼接) */
export function formatList(items: string[]): string {
  return items.join('\n')
}

/**
 * 算法A：y 重叠贪心聚行。
 *
 * 参数：
 * - tolerance (number)：纵向聚行容差（px），用于把视觉对齐但有微小间隙的节点归为一行。
 * - includeCoords (boolean)：行内每项是否带 [x,y] 前缀。
 * - separator (select)：行内连接符（'\t' / ', ' / '; ' / ' | '）。
 *
 * 结果：行与行之间用 '\n' 拼接；每行内部按 x 排序后用 separator 拼接。
 */
const rowClusterAlgorithm: ViewTextAlgorithm = {
  id: 'rowCluster',
  labelKey: 'viewTextPanel.algorithmRow',
  output: 'rows',
  params: [
    { key: 'tolerance', labelKey: 'viewTextPanel.paramTolerance', type: 'number', default: -30, step: 1 },
    { key: 'includeCoords', labelKey: 'viewTextPanel.paramIncludeCoords', type: 'boolean', default: false },
    {
      key: 'separator',
      labelKey: 'viewTextPanel.paramSeparator',
      type: 'select',
      default: '\t',
      options: [
        { labelKey: 'viewTextPanel.sepTab', value: '\t' },
        { labelKey: 'viewTextPanel.sepComma', value: ', ' },
        { labelKey: 'viewTextPanel.sepSemicolon', value: '; ' },
        { labelKey: 'viewTextPanel.sepPipe', value: ' | ' },
      ],
    },
  ],
  build(nodes, params) {
    const tolerance = typeof params.tolerance === 'number' ? params.tolerance : 10
    const includeCoords = params.includeCoords === true

    // 1. 按 y 升序排序（保证聚行确定性）
    const sorted = [...nodes].sort((a, b) => a.y - b.y)

    // 2. 贪心聚行：区间 [minY, maxY] 重叠（含容差）则并入
    const rows: Array<{ minY: number; maxY: number; items: ViewTextNode[] }> = []
    for (const node of sorted) {
      const top = node.y
      const bottom = node.y + node.height
      let placed = false
      for (const row of rows) {
        if (top <= row.maxY + tolerance && bottom >= row.minY - tolerance) {
          row.items.push(node)
          row.minY = Math.min(row.minY, top)
          row.maxY = Math.max(row.maxY, bottom)
          placed = true
          break
        }
      }
      if (!placed) {
        rows.push({ minY: top, maxY: bottom, items: [node] })
      }
    }

    // 3. 行内按 x 排序并格式化单元格 → 返回二维数组（拼接由调度器 formatRows 负责）
    return rows.map((row) =>
      [...row.items]
        .sort((a, b) => a.x - b.x)
        .map((n) => (includeCoords ? `[${n.x},${n.y}] ${firstLine(n.text)}` : firstLine(n.text))),
    )
  },
}

/**
 * 算法B：直线命中聚行。
 *
 * 思想：用若干条水平的"搜索线"（y = 中心y + offset）穿过节点内部，线经过的节点归为一行。
 * 中心 y 按阈值过滤去重得到基础 Y 列表，再逐个加 offset 变成搜索坐标，保证线穿过节点内部。
 *
 * 参数：
 * - yThreshold (number)：中心 y 过滤阈值（px），相邻中心 y 距离小于该值则合并保留（去重）。
 * - offset (number)：每个搜索坐标统一加值（保证线穿过节点内部）。
 * - overlapRatio (number)：相邻两行按重复率合并的阈值（0~1）。
 * - includeCoords (boolean)：行内每项是否带 [x,y] 前缀。
 * - separator (select)：行内连接符（'\t' / ', ' / '; ' / ' | '）。
 *
 * 结果：行与行之间用 '\n' 拼接；每行内部按 x 排序后用 separator 拼接。
 */
const lineHitAlgorithm: ViewTextAlgorithm = {
  id: 'lineHit',
  labelKey: 'viewTextPanel.algorithmLine',
  output: 'rows',
  params: [
    { key: 'yThreshold', labelKey: 'viewTextPanel.paramYThreshold', type: 'number', default: 10, step: 1 },
    { key: 'offset', labelKey: 'viewTextPanel.paramOffset', type: 'number', default: 0, step: 1 },
    { key: 'overlapRatio', labelKey: 'viewTextPanel.paramOverlapRatio', type: 'number', default: 0.5, step: 0.05 },
    { key: 'includeCoords', labelKey: 'viewTextPanel.paramIncludeCoords', type: 'boolean', default: false },
    {
      key: 'separator',
      labelKey: 'viewTextPanel.paramSeparator',
      type: 'select',
      default: '\t',
      options: [
        { labelKey: 'viewTextPanel.sepTab', value: '\t' },
        { labelKey: 'viewTextPanel.sepComma', value: ', ' },
        { labelKey: 'viewTextPanel.sepSemicolon', value: '; ' },
        { labelKey: 'viewTextPanel.sepPipe', value: ' | ' },
      ],
    },
  ],
  build(nodes, params) {
    const yThreshold = typeof params.yThreshold === 'number' ? params.yThreshold : 10
    const offset = typeof params.offset === 'number' ? params.offset : 5
    const overlapRatio = typeof params.overlapRatio === 'number' ? params.overlapRatio : 0.5
    const includeCoords = params.includeCoords === true

    // 1. 空输入返回空数组
    if (nodes.length === 0) return []

    // 2. 计算每个节点中心 y
    const withCenter = nodes.map((node) => ({ node, centerY: node.y + node.height / 2 }))

    // 3. 按 centerY 升序排序，做阈值过滤去重得到基础 Y 列表 kept
    withCenter.sort((a, b) => a.centerY - b.centerY)
    const kept: number[] = []
    for (const item of withCenter) {
      if (kept.length === 0 || item.centerY - kept[kept.length - 1] >= yThreshold) {
        kept.push(item.centerY)
      }
    }

    // 4. 搜索坐标 = 每个保留中心 y + offset
    const searchYs = kept.map((c) => c + offset)

    // 5. 逐搜索坐标收集命中行：线严格穿过节点内部，跳过空行
    const rawRows: ViewTextNode[][] = []
    for (const lineY of searchYs) {
      const row = nodes.filter((node) => node.y < lineY && lineY < node.y + node.height)
      if (row.length > 0) rawRows.push(row)
    }

    // 6. 相邻行按重复率去重：重复率高于阈值时，去除较短行中的重复元素；
    //    若较短行去重后为空，则抛弃该行。
    const mergedRows: ViewTextNode[][] = []
    for (const row of rawRows) {
      if (mergedRows.length === 0) {
        mergedRows.push([...row])
        continue
      }
      const prev = mergedRows[mergedRows.length - 1]
      const prevSet = new Set(prev.map((n) => n.id))
      const repeated = row.filter((n) => prevSet.has(n.id)).length
      const ratio = repeated / Math.min(prev.length, row.length)
      if (ratio >= overlapRatio) {
        if (row.length <= prev.length) {
          // 当前行较短（或等长）：移除与上一行重复的元素
          const filtered = row.filter((n) => !prevSet.has(n.id))
          if (filtered.length > 0) mergedRows.push(filtered)
          // 去空则抛弃当前行
        } else {
          // 上一行较短：移除与当前行重复的元素
          const rowSet = new Set(row.map((n) => n.id))
          const filtered = prev.filter((n) => !rowSet.has(n.id))
          if (filtered.length > 0) mergedRows[mergedRows.length - 1] = filtered
          else mergedRows[mergedRows.length - 1] = [...row] // 上一行去空则抛弃，用当前行顶上
        }
      } else {
        // 低于阈值：当前行原样入列
        mergedRows.push([...row])
      }
    }

    // 7. 每行内按 x 升序排序并格式化单元格 → 返回二维数组（拼接由调度器 formatRows 负责）
    return mergedRows.map((row) =>
      [...row]
        .sort((a, b) => a.x - b.x)
        .map((n) => (includeCoords ? `[${n.x},${n.y}] ${firstLine(n.text)}` : firstLine(n.text))),
    )
  },
}

/**
 * 算法C：直接收集当前视图全部子节点（不做任何空间聚类），扁平列表，每项一行。
 * 参数：includeCoords (boolean) 是否带 [x,y] 前缀。
 */
const collectAllAlgorithm: ViewTextAlgorithm = {
  id: 'collectAll',
  labelKey: 'viewTextPanel.algorithmCollectAll',
  output: 'list',
  params: [{ key: 'includeCoords', labelKey: 'viewTextPanel.paramIncludeCoords', type: 'boolean', default: false }],
  build(nodes, params) {
    const includeCoords = params.includeCoords === true
    // 原文顺序原样输出，不做排序/聚类
    return nodes.map((n) => (includeCoords ? `[${n.x},${n.y}] ${firstLine(n.text)}` : firstLine(n.text)))
  },
}

/** 已注册算法列表（单一数据源，顺序即面板下拉顺序） */
export const VIEW_TEXT_ALGORITHMS: ViewTextAlgorithm[] = [rowClusterAlgorithm, lineHitAlgorithm, collectAllAlgorithm]

/** 按 id 查算法；未命中返回 undefined */
export function getViewTextAlgorithm(id: string): ViewTextAlgorithm | undefined {
  return VIEW_TEXT_ALGORITHMS.find((a) => a.id === id)
}

/**
 * 视图转文本统一调度器。
 *
 * @param nodes  - 视图节点（通常 = nodeStore.childrenOf(currentNodeId)）
 * @param algoId - 算法 id；未知时回退到第一个注册算法
 * @param params - 算法参数字典（缺失字段用该算法 schema 的默认值）
 * @returns 格式化文本
 */
export function buildViewText(
  nodes: ViewTextNode[],
  algoId: string,
  params: Record<string, unknown> = {},
): string {
  const algo = getViewTextAlgorithm(algoId) ?? VIEW_TEXT_ALGORITHMS[0]
  if (!algo) return ''

  // 用 schema 默认值补齐缺失参数
  const merged: Record<string, unknown> = { ...params }
  for (const p of algo.params) {
    if (merged[p.key] === undefined) merged[p.key] = p.default
  }

  const result = algo.build(nodes, merged)
  // 按输出形态二选一调度：list 走 formatList，rows 走 formatRows（separator 取自 merged）
  if (algo.output === 'list') return formatList(result as string[])
  return formatRows(result as string[][], typeof merged.separator === 'string' ? merged.separator : '\t')
}