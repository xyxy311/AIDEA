/**
 * useAIWordAdd — AI 生成词「添加为节点」的共享逻辑
 *
 * 从 FloatingAIWordPanel 抽取，供浮动面板与底部小字条（strip）共用。
 * 依赖 useActiveView / useStageSize / useCommands，逻辑与现面板完全一致：
 * - viewportCenterWorld()：把视口中心屏幕坐标换算为世界坐标（左上角定位基准）
 * - addWord()：单个词添加为节点（左上角居中于视口中心）并选中
 * - addAll()：全部词网格排布（列数 3），beginBatch/commitBatch 合并为单条历史，选中最后创建的节点
 *
 * 添加节点换算：world = (screen - offset) / scale，
 * 再经 useCommands().createNode 创建并入历史栈。
 */
import { useActiveView } from '@/composables/useActiveView'
import { useStageSize } from '@/composables/useStageSize'
import { useCommands } from '@/composables/useCommands'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'

export function useAIWordAdd() {
  const active = useActiveView()
  const commands = useCommands()
  const { stageWidth, stageHeight } = useStageSize()

  /** 视口中心的世界坐标（左上角定位基准） */
  function viewportCenterWorld(): { x: number; y: number } {
    const cx = stageWidth.value / 2
    const cy = stageHeight.value / 2
    return {
      x: (cx - active.view.stageX) / active.view.stageScale,
      y: (cy - active.view.stageY) / active.view.stageScale,
    }
  }

  /** 添加单个词为节点（左上角居中于视口中心）并选中 */
  function addWord(word: string): void {
    const { x: cx, y: cy } = viewportCenterWorld()
    const nodeX = cx - DEFAULT_NODE_WIDTH / 2
    const nodeY = cy - DEFAULT_NODE_HEIGHT / 2
    const id = commands.createNode(active.project.currentNodeId, nodeX, nodeY, word)
    active.view.selectNode(id)
  }

  /** 全部添加：网格排布（列数 3），合并为单条历史，添加后不关闭面板 */
  function addAll(words: string[]): void {
    const cols = 3
    const gapX = DEFAULT_NODE_WIDTH + 24
    const gapY = DEFAULT_NODE_HEIGHT + 24
    const { x: cx, y: cy } = viewportCenterWorld()
    // 整个网格左上角对齐视口中心
    const startX = cx
    const startY = cy
    const ids: string[] = []
    commands.beginBatch()
    try {
      words.forEach((word, idx) => {
        const col = idx % cols
        const row = Math.floor(idx / cols)
        const id = commands.createNode(
          active.project.currentNodeId,
          startX + col * gapX,
          startY + row * gapY,
          word,
        )
        ids.push(id)
      })
    } finally {
      commands.commitBatch()
    }
    // 选中最后创建的节点
    if (ids.length > 0) {
      active.view.selectNode(ids[ids.length - 1])
    }
  }

  return { addWord, addAll }
}