/**
 * useAIWordAdd — AI 生成词「添加为节点」的共享逻辑（插件版）
 *
 * 从 FloatingAIWordPanel 抽取，供浮动面板共用。插件化后写路径换成插件适配层：
 * - 节点创建：adapter.api.node.create（内部经 useCommands，自动入历史栈）
 * - 批量合并：adapter.api.project.beginBatch/commitBatch（单条历史）
 * - 视口换算：offset / scale 读 adapter.api.view（stageX/stageY/stageScale）；
 *   画布屏幕尺寸读 useStageSize（adapter api 未暴露容器尺寸，沿用主程序单例 composable）
 * - 选中：adapter.api.view.select
 *
 * 添加节点换算（与原版一致）：world = (screen - offset) / scale。
 */
import { useStageSize } from '@/composables/useStageSize'
import { adapter } from '@/plugin/adapter'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'

export function useAIWordAdd() {
  const { stageWidth, stageHeight } = useStageSize()

  /** 视口中心的世界坐标（左上角定位基准）：world = (screen - offset) / scale */
  function viewportCenterWorld(): { x: number; y: number } {
    const cx = stageWidth.value / 2
    const cy = stageHeight.value / 2
    const scale = adapter.api.view.stageScale()
    return {
      x: (cx - adapter.api.view.stageX()) / scale,
      y: (cy - adapter.api.view.stageY()) / scale,
    }
  }

  /** 添加单个词为节点（左上角居中于视口中心）并选中 */
  function addWord(word: string): void {
    const { x: cx, y: cy } = viewportCenterWorld()
    const id = adapter.api.node.create(
      adapter.api.view.active().viewedNodeId,
      cx - DEFAULT_NODE_WIDTH / 2,
      cy - DEFAULT_NODE_HEIGHT / 2,
      word,
    )
    adapter.api.view.select(id)
  }

  /** 全部添加：网格排布（列数 3），合并为单条历史，添加后不关闭面板 */
  function addAll(words: string[]): void {
    const cols = 3
    const gapX = DEFAULT_NODE_WIDTH + 24
    const gapY = DEFAULT_NODE_HEIGHT + 24
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
