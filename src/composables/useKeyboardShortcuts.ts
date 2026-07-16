import { onMounted, onUnmounted, type Ref } from 'vue'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'

/**
 * 全局键盘快捷键
 *
 * @param isEditing - 是否正在文本编辑中，编辑时禁用快捷键
 *
 * Delete / Backspace — 删除选中节点
 * Escape            — 取消选中
 */
export function useKeyboardShortcuts(isEditing: Ref<boolean>) {
  const active = useActiveWhiteboard()

  function onKeydown(e: KeyboardEvent) {
    // 编辑状态下不触发快捷键
    if (isEditing.value) return

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (active.board.selectedNodeId !== null) {
        e.preventDefault()
        active.board.deleteNode(active.board.selectedNodeId)
      }
    }

    if (e.key === 'Escape') {
      active.board.selectNode(null)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
  })
}
