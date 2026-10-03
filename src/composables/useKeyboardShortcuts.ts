import { onMounted, onUnmounted, computed, type Ref } from 'vue'
import { useActiveView } from '@/composables/useActiveView'
import { useNodeViewLink } from '@/composables/useNodeViewLink'
import { useCommands } from '@/composables/useCommands'
import { useProjectStore } from '@/stores/project'
import { usePresetsStore } from '@/stores/presets'
import { useLayoutStore } from '@/stores/layout'
import { useTagsStore } from '@/stores/tags'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useModalStore } from '@/stores/modal'
import type { WhiteboardNode } from '@/types'
import { requestSearchFocus } from '@/composables/useSearchFocus'
import { CUSTOM_SHORTCUTS } from '@/constants/shortcuts'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { toChordString, normalizeKey } from '@/utils/shortcuts'
import type { ShortcutScope } from '@/types/shortcuts'

/**
 * 全局键盘快捷键：规范化 chord + 单一运行时 Map，O(1) 匹配一个动作。
 * scope 'always' 在输入/编辑守卫前执行（文件/搜索），'canvas' 在守卫后执行。
 * 锁定键与可改动作同进一 Map，冲突由 shortcuts store 的 assign 挡住；
 * 1-9 按住序号修饰键（默认 T）打标签，否则应用可见预设。
 * 与网格层契约：子组件 onMounted 先于父级，网格层 stopImmediatePropagation = 独占，本层收不到。
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
  const project = useProjectStore()
  const link = useNodeViewLink('main')
  const commands = useCommands()
  const presets = usePresetsStore()
  const layout = useLayoutStore()
  const tagsStore = useTagsStore()
  const shortcuts = useShortcutsStore()
  const modalStore = useModalStore()

  /** 序号修饰键是否处于按下状态（决定 1-9 走预设还是打标签） */
  let seqHeld = false

  // ── 可自定义动作的 run 实现（闭包捕获各 store / projectFile）──
  const customRuns: Record<string, (e: KeyboardEvent) => void> = {
    save: (e) => {
      e.preventDefault()
      projectFile?.saveProject()
    },
    open: (e) => {
      e.preventDefault()
      projectFile?.openProject()
    },
    new: (e) => {
      e.preventDefault()
      projectFile?.newProject()
    },
    search: (e) => {
      e.preventDefault()
      layout.setActive('search')
      requestSearchFocus()
    },
    group: (e) => {
      if (active.view.selectedNodeIds.size >= 2) {
        e.preventDefault()
        link.groupSelectedNodes()
      }
    },
    enterChild: (e) => {
      if (active.view.selectedNodeIds.size === 1) {
        e.preventDefault()
        link.enterNodeView()
      }
    },
    enterParent: (e) => {
      e.preventDefault()
      link.enterParentNodeView()
    },
    toggleInline: (e) => {
      const view = active.view
      if (view.selectedNodeIds.size === 1) {
        e.preventDefault()
        link.toggleInlineView(view.selectedNodeId)
      }
    },
    fitInline: (e) => {
      const view = active.view
      if (view.selectedNodeIds.size === 1) {
        const nodeId = view.selectedNodeId
        if (nodeId && view.getInlineViewRect(nodeId)) {
          e.preventDefault()
          link.fitInlineView(nodeId)
        }
      }
    },
    // 字母 d 的删除（可自定义，默认 d）；Delete/Backspace 在锁定层固定
    deleteSelected: runDelete,
    navBack: (e) => {
      e.preventDefault()
      project.navigateBack()
    },
    navForward: (e) => {
      e.preventDefault()
      project.navigateForward()
    },
  }

  /** 删除所有选中的连线 / 节点（锁定） */
  function runDelete(e: KeyboardEvent): void {
    const view = active.view
    if (view.selectedConnectionIds.size > 0) {
      e.preventDefault()
      active.deleteSelectedConnections()
    } else if (view.selectedNodeIds.size > 0) {
      e.preventDefault()
      active.deleteSelectedNodes()
    }
  }

  /** 序号键 1-9（锁定）的 run：按住序号修饰键 → 打标签；否则应用可见预设 */
  function makeSeqRun(n: number): (e: KeyboardEvent) => void {
    return (e) => {
      const view = active.view
      const index = n - 1
      if (seqHeld) {
        const tag = tagsStore.tagList[index]
        if (tag && view.selectedNodeIds.size > 0) {
          e.preventDefault()
          const ids = Array.from(view.selectedNodeIds)
          const nodes = ids
            .map((nodeId) => active.nodeStore.getNode(nodeId))
            .filter((node): node is WhiteboardNode => !!node)
          if (nodes.length === 0) return
          const allHave = nodes.every((node) => (node.tagIds ?? []).includes(tag.id))
          const apply = !allHave
          const perNode = nodes.map((node) => {
            const cur = node.tagIds ?? []
            const has = cur.includes(tag.id)
            if (apply) return has ? cur : [...cur, tag.id]
            return has ? cur.filter((tagId) => tagId !== tag.id) : cur
          })
          commands.updateNodesTagsPerNode(ids, perNode)
        }
        return
      }
      // 预设：节点优先，其次连线
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
            {
              lineStyle: preset.lineStyle,
              strokeWidth: preset.strokeWidth,
              strokeColor: preset.strokeColor,
              directed: preset.directed,
              ...(preset.applyText ? { text: preset.name } : {}),
            },
          )
        }
      }
    }
  }

  /** 运行时匹配表：规范化 chord → 条目。锁定 + 可改动作统一进入同一 Map。 */
  const runtimeMap = computed<Map<string, { id: string; scope: ShortcutScope; run: (e: KeyboardEvent) => void }>>(
    () => {
      const map = new Map<string, { id: string; scope: ShortcutScope; run: (e: KeyboardEvent) => void }>()
      const canvas = 'canvas' as const

      // ── 锁定动作 ──
      map.set('mod+z', { id: 'undo', scope: canvas, run: (e) => { e.preventDefault(); commands.undo() } })
      map.set('mod+shift+z', { id: 'redo', scope: canvas, run: (e) => { e.preventDefault(); commands.redo() } })
      map.set('mod+y', { id: 'redo', scope: canvas, run: (e) => { e.preventDefault(); commands.redo() } })
      map.set('mod+c', {
        id: 'copy', scope: canvas, run: (e) => {
          if (active.view.selectedNodeIds.size > 0) { e.preventDefault(); active.copySelectedNodes() }
        },
      })
      map.set('mod+x', {
        id: 'cut', scope: canvas, run: (e) => {
          if (active.view.selectedNodeIds.size > 0) { e.preventDefault(); active.cutSelectedNodes() }
        },
      })
      map.set('mod+v', {
        id: 'paste', scope: canvas, run: (e) => {
          if (active.canPaste.value) { e.preventDefault(); active.pasteIntoView() }
        },
      })
      map.set('delete', { id: 'delete', scope: canvas, run: runDelete })
      map.set('backspace', { id: 'delete', scope: canvas, run: runDelete })
      map.set('escape', { id: 'escape', scope: canvas, run: (e) => { active.view.clearSelection() } })
      // 方向键：移动选中节点（锁定；共享动作自带拖拽守卫与选中/直接子节点过滤，无选中时空转）
      map.set('up', { id: 'arrowMoveUp', scope: canvas, run: (e) => { e.preventDefault(); active.moveSelectedNodesByArrow('up') } })
      map.set('down', { id: 'arrowMoveDown', scope: canvas, run: (e) => { e.preventDefault(); active.moveSelectedNodesByArrow('down') } })
      map.set('left', { id: 'arrowMoveLeft', scope: canvas, run: (e) => { e.preventDefault(); active.moveSelectedNodesByArrow('left') } })
      map.set('right', { id: 'arrowMoveRight', scope: canvas, run: (e) => { e.preventDefault(); active.moveSelectedNodesByArrow('right') } })
      // Enter：编辑选中节点（锁定；无选中时空转——网格模式下网格层会独占处理建节点/命中选中）
      map.set('enter', {
        id: 'editSelected', scope: canvas, run: (e) => {
          const v = active.view
          if (v.selectedNodeId) {
            e.preventDefault()
            v.startEditing(v.selectedNodeId)
          }
        },
      })
      for (let n = 1; n <= 9; n++) {
        map.set(String(n), { id: `seq${n}`, scope: canvas, run: makeSeqRun(n) })
      }
      // Ctrl+Tab：切换标签页（从左向右，末尾环绕回第一个；锁定，不可改绑）
      map.set('mod+tab', {
        id: 'nextTab',
        scope: 'always',
        run: (e) => {
          if (project.tabs.length === 0) return
          const idx = project.tabs.findIndex((tb) => tb.id === project.activeTabId)
          const next = project.tabs[(idx + 1) % project.tabs.length]
          if (next.id !== project.activeTabId) {
            e.preventDefault()
            project.switchToTab(next.id)
          }
        },
      })

      // ── 可自定义动作（scope 来自注册表，绑定来自 store）──
      for (const def of CUSTOM_SHORTCUTS) {
        const chord = shortcuts.getBinding(def.id)
        if (chord) {
          map.set(chord, { id: def.id, scope: def.scope, run: customRuns[def.id] })
        }
      }

      // ── 插件注册动作（key = `${pluginId}:${id}`；绑定来自 store，run 由插件提供）──
      const registry = useUiRegistryStore()
      for (const [key, entry] of registry.shortcutActions) {
        const chord = shortcuts.getBinding(key)
        if (!chord) continue
        const run = entry.def.run
        map.set(chord, { id: key, scope: entry.def.scope, run: () => run() })
      }

      return map
    },
  )

  function onKeydown(e: KeyboardEvent) {
    // 追踪「序号修饰键」按住态（在最前，即使该键同时被约绑定也不影响打标签）
    if (normalizeKey(e.key) === shortcuts.seqModKey) seqHeld = true

    const entry = runtimeMap.value.get(toChordString(e))
    if (!entry) return

    // 模态打开 = 独占交互：抑制全部 scope（含 always）的画布快捷键
    if (modalStore.hasOpenModal) return

    // scope='always'：在守卫之前执行（文件操作 / 搜索，编辑中也可用）
    if (entry.scope === 'always') {
      entry.run(e)
      return
    }

    // canvas scope：输入框 / 文本域守卫，以及编辑态守卫
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (isEditing.value) return

    entry.run(e)
  }

  /**
   * keyup：释放「序号修饰键」时复位 seqHeld
   */
  function onKeyup(e: KeyboardEvent) {
    if (normalizeKey(e.key) === shortcuts.seqModKey) seqHeld = false
  }

  /**
   * 鼠标侧边键（锁定，不可改绑）：button 3 = 后退，4 = 前进。
   * 守卫与 canvas scope 一致（模态 / 输入框 / 编辑态抑制），避免打断输入。
   */
  function onMouseDown(e: MouseEvent): void {
    if (e.button !== 3 && e.button !== 4) return
    if (modalStore.hasOpenModal) return
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (isEditing.value) return
    e.preventDefault()
    if (e.button === 3) project.navigateBack()
    else project.navigateForward()
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('keyup', onKeyup)
    window.addEventListener('mousedown', onMouseDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('keyup', onKeyup)
    window.removeEventListener('mousedown', onMouseDown)
  })
}