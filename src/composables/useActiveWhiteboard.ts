import { useProjectStore } from '@/stores/project'
import { useWhiteboardStore } from '@/stores/whiteboard'

/**
 * 快捷访问当前活跃白板的 composable
 *
 * 组合 project store 和 per-whiteboard store。
 *
 * `board` 是一个 getter——每次访问时重新获取当前活跃白板的 store，
 * 确保切换白板后所有引用自动指向新的 store 实例。
 *
 * 用法：
 *   const active = useActiveWhiteboard()
 *   active.board.nodesArray   // 始终是当前白板的节点
 *   active.project.whiteboards // 项目级白板列表
 */
export function useActiveWhiteboard() {
  const project = useProjectStore()

  return {
    project,
    get board() {
      return useWhiteboardStore(project.activeWhiteboardId)
    },
  }
}
