import { onMounted, onUnmounted, type Ref } from 'vue'
import { useActiveView } from '@/composables/useActiveView'
import { useNodeViewLink } from '@/composables/useNodeViewLink'
import { useCommands } from '@/composables/useCommands'
import { useProjectStore } from '@/stores/project'
import { usePresetsStore } from '@/stores/presets'

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
 * 1-9                - 对选中节点/连线应用对应序号预设
 * Tab                - 单选节点时展开/收起内联视图
 */
export function useKeyboardShortcuts(isEditing: Ref<boolean>) {
  const active = useActiveView()
  const link = useNodeViewLink('main')
  const commands = useCommands()
  const presets = usePresetsStore()

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

    // 数字键 1-9：对选中节点/连线快速应用对应序号的预设
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '1' && e.key <= '9') {
      const index = Number(e.key) - 1
      if (view.selectedNodeIds.size > 0) {
        const preset = presets.nodePresets[index]
        if (preset) {
          e.preventDefault()
          commands.updateNodesStyle(
            Array.from(view.selectedNodeIds),
            { backgroundColor: preset.backgroundColor, borderColor: preset.borderColor, textColor: preset.textColor },
          )
        }
      } else if (view.selectedConnectionIds.size > 0) {
        const preset = presets.connectionPresets[index]
        if (preset) {
          e.preventDefault()
          commands.updateConnectionsStyleByIds(
            Array.from(view.selectedConnectionIds),
            { lineStyle: preset.lineStyle, strokeWidth: preset.strokeWidth, strokeColor: preset.strokeColor, directed: preset.directed },
          )
        }
      }
    }

    // Tab：单选节点时展开/收起内联视图（仅主视图）
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (view.selectedNodeIds.size === 1) {
        e.preventDefault()
        console.log('tab pressed')
        link.toggleInlineView(view.selectedNodeId)
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
