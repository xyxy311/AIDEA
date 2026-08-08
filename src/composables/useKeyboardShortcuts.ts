import { onMounted, onUnmounted, type Ref } from 'vue'
import { useActiveView } from '@/composables/useActiveView'
import { useNodeViewLink } from '@/composables/useNodeViewLink'
import { useCommands } from '@/composables/useCommands'
import { useProjectStore } from '@/stores/project'
import { usePresetsStore } from '@/stores/presets'
import { useLayoutStore } from '@/stores/layout'
import { useTagsStore } from '@/stores/tags'
import type { WhiteboardNode } from '@/types'
import { requestSearchFocus } from '@/composables/useSearchFocus'

/**
 * 全局键盘快捷键
 *
 * @param isEditing - 是否正在文本编辑中，编辑时禁用快捷键
 *
 * Ctrl/Cmd + Z       - 撤销
 * Ctrl/Cmd + Shift+Z - 重做
 * Ctrl/Cmd + Y       - 重做
 * Ctrl/Cmd + C       - 复制选中节点（含子树与内部连线）
 * Ctrl/Cmd + X       - 剪切选中节点
 * Ctrl/Cmd + V       - 粘贴到当前视图
 * Delete / Backspace - 删除选中节点 / 连线
 * Escape             - 取消选中
 * A                  - 进入选中节点的子级视图（任何节点均可进入）
 * Ctrl/Cmd + G       - 组合选中节点
 * 1-9                - 对选中节点/连线应用对应序号预设
 * T + 1-9            - 按住 t 时按数字，对选中节点批量添加/删除"标签列表"中对应序号标签
 * Tab                - 单选节点时展开/收起内联视图
 * R                  - 选中内联视图时自适应视图（以宽度为基准调整缩放与高度）
 * Ctrl/Cmd + S       - 保存项目
 * Ctrl/Cmd + O       - 打开项目
 * Ctrl/Cmd + N       - 新建项目
 *
 * @param isEditing   - 是否正在文本编辑中，编辑时禁用快捷键
 * @param projectFile - 项目文件操作（可选），提供后启用 S/O/N 文件快捷键
 */
export function useKeyboardShortcuts(
  isEditing: Ref<boolean>,
  projectFile?: {
    saveProject: () => void
    openProject: () => void
    newProject: () => void
  },
) {
  const active = useActiveView()
  const link = useNodeViewLink('main')
  const commands = useCommands()
  const presets = usePresetsStore()
  const layout = useLayoutStore()
  const tagsStore = useTagsStore()

  /** t 键是否处于按下状态（作为"t + 数字"打标签的修饰） */
  let tHeld = false

  function onKeydown(e: KeyboardEvent) {
    // ── 文件操作快捷键（置于编辑判定之前，编辑状态下也可保存 / 打开 / 新建）──
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase()
      if (key === 's' && projectFile) {
        e.preventDefault()
        projectFile.saveProject()
        return
      }
      if (key === 'o' && projectFile) {
        e.preventDefault()
        projectFile.openProject()
        return
      }
      if (key === 'n' && projectFile) {
        e.preventDefault()
        projectFile.newProject()
        return
      }
    }

    // Ctrl/Cmd + F：打开搜索面板并聚焦搜索输入框（置于输入框焦点守卫之前，编辑文本时也可触发）
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase()
      if (key === 'f') {
        e.preventDefault()
        layout.setActive('search')
        requestSearchFocus()
        return
      }
    }

    // 焦点在输入框或文本域时，不触发快捷键（避免删除/退格误删节点）
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    // 编辑状态下不触发快捷键
    if (isEditing.value) return

    // 记录 t 键按下状态（作为"t + 数字"打标签的修饰）
    if (e.key.toLowerCase() === 't') tHeld = true

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

    // ── 复制 / 剪切 / 粘贴（对象剪贴板，不进入撤销重做）──
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase()
      if (key === 'c') {
        if (view.selectedNodeIds.size > 0) {
          e.preventDefault()
          active.copySelectedNodes()
        }
        return
      }
      if (key === 'x') {
        if (view.selectedNodeIds.size > 0) {
          e.preventDefault()
          active.cutSelectedNodes()
        }
        return
      }
      if (key === 'v') {
        if (active.canPaste.value) {
          e.preventDefault()
          active.pasteIntoView()
        }
        return
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

    // 数字键 1-9：对选中节点/连线快速应用当前"可见列表"（受分组筛选影响）中对应序号的预设
    // （按住 t 时数字键用于打标签，故假设 !tHeld 才走预设）
    if (!tHeld && !e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '1' && e.key <= '9') {
      const index = Number(e.key) - 1
      if (view.selectedNodeIds.size > 0) {
        const preset = presets.visibleNodePresets[index]
        if (preset) {
          e.preventDefault()
          commands.updateNodesStyle(
            Array.from(view.selectedNodeIds),
            { borderColor: preset.borderColor },
          )
        }
      } else if (view.selectedConnectionIds.size > 0) {
        const preset = presets.visibleConnectionPresets[index]
        if (preset) {
          e.preventDefault()
          commands.updateConnectionsStyleByIds(
            Array.from(view.selectedConnectionIds),
            // applyText 为真时把预设名称写入连线文字
            { lineStyle: preset.lineStyle, strokeWidth: preset.strokeWidth, strokeColor: preset.strokeColor, directed: preset.directed, ...(preset.applyText ? { text: preset.name } : {}) },
          )
        }
      }
    }

    // T + 数字 1-9：按住 t 时按数字键，对选中节点批量添加/删除"标签列表"中对应序号的标签
    // （纯数字 1-9 已用于应用预设，这里用"按住 t"作为修饰，避免与 Ctrl 快捷键冲突）
    if (tHeld && !e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '1' && e.key <= '9') {
      const index = Number(e.key) - 1
      const tag = tagsStore.tagList[index]
      if (tag && view.selectedNodeIds.size > 0) {
        e.preventDefault()
        const ids = Array.from(view.selectedNodeIds)
        const nodes = ids
          .map((id) => active.nodeStore.getNode(id))
          .filter((n): n is WhiteboardNode => !!n)
        if (nodes.length === 0) return
        // 全含则从所有节点移除，否则添加到所有节点；各节点保留自有其它标签
        const allHave = nodes.every((n) => (n.tagIds ?? []).includes(tag.id))
        const apply = !allHave
        const perNode = nodes.map((n) => {
          const cur = n.tagIds ?? []
          const has = cur.includes(tag.id)
          if (apply) return has ? cur : [...cur, tag.id]
          return has ? cur.filter((id) => id !== tag.id) : cur
        })
        commands.updateNodesTagsPerNode(ids, perNode)
      }
      return
    }

    // Tab：单选节点时展开/收起内联视图（仅主视图）
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (view.selectedNodeIds.size === 1) {
        e.preventDefault()
        link.toggleInlineView(view.selectedNodeId)
      }
    }

    // R 键：选中内联视图宿主节点时，自适应内联视图（以宽度为基准调整缩放与高度）
    if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (view.selectedNodeIds.size === 1) {
        const nodeId = view.selectedNodeId
        if (nodeId && view.getInlineViewRect(nodeId)) {
          e.preventDefault()
          link.fitInlineView(nodeId)
        }
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('keyup', onKeyup)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('keyup', onKeyup)
  })

  /** keyup：释放 t 键时复位 tHeld，避免"按住 t + 数字"后再按数字误触发 */
  function onKeyup(e: KeyboardEvent) {
    if (e.key.toLowerCase() === 't') tHeld = false
  }
}
