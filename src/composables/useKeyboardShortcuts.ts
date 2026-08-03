import { onMounted, onUnmounted, type Ref } from 'vue'
import { useActiveView } from '@/composables/useActiveView'
import { useNodeViewLink } from '@/composables/useNodeViewLink'
import { useCommands } from '@/composables/useCommands'
import { useProjectStore } from '@/stores/project'

/**
 * 全局键盘快捷键
 *
 * @param isEditing - 是否正在文本编辑中，编辑时禁用快捷键
 *
 * Ctrl/Cmd + Z       - 撤销
 * Ctrl/Cmd + Shift+Z - 重做
 * Ctrl/Cmd + Y       - 重做
 * Delete / Backspace - 删除选中节点 / 连线
 * Escape             - 取消选中
 * A                  - 进入选中节点的子级视图（任何节点均可进入）
 * Ctrl/Cmd + G       - 组合选中节点
 */
export function useKeyboardShortcuts(isEditing: Ref<boolean>) {
  const active = useActiveView()
  const link = useNodeViewLink()
  const commands = useCommands()

  function onKeydown(e: KeyboardEvent) {
    // 焦点在输入框或文本域时，不触发快捷键（避免删除/退格误删节点）
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    // 编辑状态下不触发快捷键
    if (isEditing.value) return

    const view = active.view

    // ── 撤销 / 重做 ──
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) {
        commands.redo()
      } else {
        commands.undo()
      }
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      commands.redo()
      return
    }

    if (e.key === 'd' || e.key === 'Delete' || e.key === 'Backspace') {
      // 先删除所有选中的连线
      if (view.selectedConnectionIds.size > 0) {
        e.preventDefault()
        active.deleteSelectedConnections()
      }
      // 再删除所有选中的节点
      else if (view.selectedNodeIds.size > 0) {
        e.preventDefault()
        active.deleteSelectedNodes()
      }
    }

    if (e.key === 'Escape') {
      view.clearSelection()
    }

    // A 键：选中单个节点时，进入其子级视图（任何节点均可进入）
    if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey) {
      if (view.selectedNodeIds.size === 1) {
        e.preventDefault()
        link.enterNodeView()
      }
    }

    if (e.key === 'q' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      link.enterParentNodeView()
    }

    // Ctrl/Cmd + G：选中多个节点时组合
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
      if (view.selectedNodeIds.size >= 2) {
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
