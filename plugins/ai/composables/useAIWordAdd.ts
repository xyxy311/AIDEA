/**
 * useAIWordAdd — AI 生成词「添加为节点」的共享逻辑（插件版）
 *
 * 从 FloatingAIWordPanel 抽取，供浮动面板共用。插件化后写路径换成插件适配层：
 * - 节点创建：adapter.api.node.create（内部经 useCommands，自动入历史栈）
 * - 批量合并：adapter.api.project.beginBatch/commitBatch（单条历史）
 * - 视口中心：adapter.api.view.viewportCenterWorld()——画布尺寸与视口中心换算
 *   已由宿主侧覆盖，插件不再本地换算（不再依赖 useStageSize）
 * - 节点默认尺寸：adapter.api.node.defaultSize()——与主应用节点默认尺寸单一来源对齐
 *   （不再依赖 constants 的 DEFAULT_NODE_WIDTH/HEIGHT）
 * - 选中：adapter.api.view.select
 */
import { adapter } from '@/plugin/adapter'

export function useAIWordAdd() {
  /** 视口中心的世界坐标（左上角定位基准）：直接消费宿主换算结果 */
  function viewportCenterWorld(): { x: number; y: number } {
    return adapter.api.view.viewportCenterWorld()
  }

  /** 添加单个词为节点（左上角居中于视口中心）并选中 */
  function addWord(word: string): void {
    const { x: cx, y: cy } = viewportCenterWorld()
    const { width: nodeW, height: nodeH } = adapter.api.node.defaultSize()
    const id = adapter.api.node.create(
      adapter.api.view.active().viewedNodeId,
      cx - nodeW / 2,
      cy - nodeH / 2,
      word,
    )
    adapter.api.view.select(id)
  }

  /** 全部添加：网格排布（列数 3），合并为单条历史，添加后不关闭面板 */
  function addAll(words: string[]): void {
    const { width: nodeW, height: nodeH } = adapter.api.node.defaultSize()
    const cols = 3
    const gapX = nodeW + 24
    const gapY = nodeH + 24
    const { x: cx, y: cy } = viewportCenterWorld()
    // 整个网格左上角对齐视口中心；节点统一挂在当前视图（观察节点）下
    const startX = cx
    const startY = cy
    const parentId = adapter.api.view.active().viewedNodeId
    const ids: string[] = []
    adapter.api.project.beginBatch()
    try {
      words.forEach((word, idx) => {
        const col = idx % cols
        const row = Math.floor(idx / cols)
        const id = adapter.api.node.create(parentId, startX + col * gapX, startY + row * gapY, word)
        ids.push(id)
      })
    } finally {
      adapter.api.project.commitBatch()
    }
    // 选中最后创建的节点
    if (ids.length > 0) {
      adapter.api.view.select(ids[ids.length - 1])
    }
  }

  return { addWord, addAll }
}
