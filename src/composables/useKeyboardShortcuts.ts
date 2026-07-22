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
    // 焦点在输入框或文本域时，不触发快捷键（避免删除/退格误删节点）
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    // 编辑状态下不触发快捷键
    if (isEditing.value) return

    if (e.key === 'Delete' || e.key === 'Backspace') {
      // 先删除所有选中的连线
      if (active.board.selectedConnectionIds.size > 0) {
        e.preventDefault()
        const connIds = [...active.board.selectedConnectionIds]
        for (const id of connIds) {
          active.board.deleteConnection(id)
        }
        active.board.clearSelection()
      }
      // 再删除所有选中的节点
      else if (active.board.selectedNodeIds.size > 0) {
        e.preventDefault()
        const nodeIds = [...active.board.selectedNodeIds]
        for (const id of nodeIds) {
          active.board.deleteNode(id)
        }
        active.board.clearSelection()
      }
    }

    if (e.key === 'Escape') {
      active.board.clearSelection()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
  })
}
