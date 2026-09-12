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
 * 全局键盘快捷键
 *
 * 采用「规范化 chord + 单一运行时 Map」匹配：
 * - 每次 keydown 用 toChordString(e) 归一到字符串，直接 O(1) 查 Map 得到
 *   该键对应的条目 { id, scope, run }，结构上保证「一个键至多命中一个动作」。
 * - scope 决定触发时机：'always' 在输入框/编辑守卫之前执行（保存/打开/新建/搜索，
 *   与既有行为一致）；'canvas' 在守卫之后执行（其余全部可改动作 + 锁定动作）。
 * - 锁定键（撤销/重做、复制/剪切/粘贴、删除、Escape、方向键、Enter）与可改动作同进一个 Map，
 *   冲突由 shortcuts store 的 assign 在设置时挡住，无需额外判断。
 * - 序号键 1-9：按住「序号修饰键」(默认 T) 时打标签，否则应用可见预设。
 *
 * Ctrl/Cmd + Z       - 撤销（锁定）
 * Ctrl/Cmd + Shift+Z / Y - 重做（锁定）
 * Ctrl/Cmd + C / X / V  - 复制 / 剪切 / 粘贴（锁定）
 * Delete / Backspace / D- 删除选中（锁定）
 * Escape             - 取消选中（锁定）
 * 方向键（规范化 chord up/down/left/right）- 移动选中节点（锁定，不可自定义）
 * Enter              - 编辑选中节点（锁定，不可自定义）
 * 1-9                - 应用预设 / 序号修饰键+1-9 打标签（锁定）
 *
 * S/O/N/F/G/A/Q/Tab/R/D   - 可自定义（见 constants/shortcuts.ts）
 *
 * 事件顺序契约（与网格层 useGridMode 协作）：Vue 子组件 onMounted 先于父组件触发，
 * CanvasStage（子）的网格监听先于本文件（由 AppShell 父级挂载）的快捷键监听执行。
 * 网格层调用 stopImmediatePropagation = 独占该键（本层收不到）；
 * 不调用 = 放行给本层（如非预览 Esc、有选中 Enter、无修饰方向键的节点移动）。
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

  /** keyup：释放「序号修饰键」时复位 seqHeld */
  function onKeyup(e: KeyboardEvent) {
    if (normalizeKey(e.key) === shortcuts.seqModKey) seqHeld = false
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('keyup', onKeyup)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('keyup', onKeyup)
  })
}