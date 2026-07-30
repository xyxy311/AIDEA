import { onMounted, onUnmounted, type Ref } from 'vue'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import { useNodeWhiteboardLink } from '@/composables/useNodeWhiteboardLink'

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
  const link = useNodeWhiteboardLink()

  function onKeydown(e: KeyboardEvent) {    
    // 焦点在输入框或文本域时，不触发快捷键（避免删除/退格误删节点）
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    // 编辑状态下不触发快捷键
    if (isEditing.value) return

    if (e.key === 'd' || e.key === 'Delete' || e.key === 'Backspace') {
      // 先删除所有选中的连线
      if (active.board.selectedConnectionIds.size > 0) {
        e.preventDefault()
        active.board.deleteSelectedConnections()
      }
      // 再删除所有选中的节点
      else if (active.board.selectedNodeIds.size > 0) {
        e.preventDefault()
        active.board.deleteSelectedNodes()
      }
    }

    if (e.key === 'Escape') {
      active.board.clearSelection()
    }

    // A 键：选中单个节点时，进入关联白板（无关联则创建）
    if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey) {
      if (active.board.selectedNodeIds.size === 1) {
        e.preventDefault()
        const nodeId = active.board.selectedNodeId
        const node = nodeId ? active.board.nodes.get(nodeId) : undefined
        if (node?.hasWhiteboard) {
          link.enterLinkedWhiteboard()
        } else {
          link.createLinkedWhiteboard()
          link.enterLinkedWhiteboard()
        }
      }
    }

    // Ctrl/Cmd + G：选中多个节点时组合
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
      if (active.board.selectedNodeIds.size >= 2) {
        e.preventDefault()
        link.groupSelectedNodes()
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
  })
}
