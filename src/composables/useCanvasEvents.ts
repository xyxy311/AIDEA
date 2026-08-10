import type { KonvaEventObject } from 'konva/lib/Node'
import { t } from '@/composables/useT'
import { useViewStore } from '@/stores/view'
import { useNodeStore } from '@/stores/node'
import { useCommands } from '@/composables/useCommands'
import { useContextMenu, type ContextMenuItem } from '@/composables/useContextMenu'
import { useNodeViewLink } from '@/composables/useNodeViewLink'
import { useClipboard } from '@/composables/useClipboard'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'
import { snapPosition, snapFocus } from '@/utils/grid'

/**
 * 画布事件处理
 *
 * @param viewId - 视图 ID（主视图传 'main'）
 *
 * 提供针对 v-stage 事件的回调：
 * - handleStageClick：点击空白区域取消选中
 * - handleStageDblClick：双击空白区域创建新节点（并进入编辑态）
 * - handleStageContextMenu：右键弹出上下文菜单（按选中数量生成菜单项）
 *
 * 右键菜单内容：
 * - 复制 / 剪切：有选中节点时可用
 * - 粘贴：剪贴板有内容时可用
 * - 单选节点：进入子视图 / 清空子级（有子节点时）
 * - 多选节点：组合
 */
export function useCanvasEvents(viewId: string) {
  const view = useViewStore(viewId)
  const nodeStore = useNodeStore()
  const contextMenu = useContextMenu()
  const link = useNodeViewLink(viewId)
  const commands = useCommands()
  const clipboard = useClipboard()

  /**
   * 处理画布点击事件
   * 当点击目标为 Stage 本身（非节点）时，取消选中
   */
  function handleStageClick(e: KonvaEventObject<MouseEvent>) {
    // Konva 中：点击空白区域时，e.target === e.currentTarget (Stage)
    if (e.target === e.currentTarget) {
      view.clearSelection()
    }
  }

  /**
   * 处理画布双击事件
   * 仅在空白区域双击时创建新节点（避免双击节点时误创建）
   */
  function handleStageDblClick(e: KonvaEventObject<MouseEvent>) {
    // 仅响应左键双击；右键双击留给 contextmenu，避免误触发新建节点
    if (e.evt.button !== 0) return
    // 仅在点击 Stage 空白区域时创建节点（非节点/形状之上）
    if (e.target !== e.currentTarget) {
      return
    }
    const stage = e.target.getStage()
    // getRelativePointerPosition() 返回世界坐标（已考虑 Stage 的 scale/offset）
    const pos = stage?.getRelativePointerPosition()
    if (pos) {
      // 减去半个节点尺寸，使节点的中心对齐鼠标光标位置
      const left = pos.x - DEFAULT_NODE_WIDTH / 2
      const top = pos.y - DEFAULT_NODE_HEIGHT / 2

      let newX = left
      let newY = top
      if (view.gridMode) {
        // 网格模式：节点左上角吸附到最近 100 格点（四舍五入到百）
        newX = snapPosition(left)
        newY = snapPosition(top)
      }

      const newId = commands.createNode(view.viewedNodeId, newX, newY)

      // 网格模式：新建后同步活动网格到节点中心（吸附到 50 倍数）
      if (view.gridMode) {
        const n = nodeStore.getNode(newId)
        if (n) {
          view.setActiveGrid(snapFocus(n.x + n.width / 2), snapFocus(n.y + n.height / 2))
        }
      }

      // 新建后选中并进入编辑态（数据与视图状态分离，需手动编排）
      view.selectNode(newId)
      view.startEditing(newId)
    }
  }

  /**
   * 处理画布右键菜单事件
   *
   * 阻止浏览器默认菜单，并根据当前选中状态弹出上下文菜单：
   * - 复制 / 剪切：有选中节点时可用
   * - 粘贴：剪贴板有内容时可用
   * - 单选节点：进入子视图 / 清空子级（有子节点时）
   * - 多选节点：组合
   */
  function handleStageContextMenu(e: KonvaEventObject<MouseEvent>) {
    e.evt.preventDefault()

    const count = view.selectedNodeIds.size

    const items: ContextMenuItem[] = []

    // ── 复制 / 剪切（有选中节点时可用）──
    if (count > 0) {
      items.push({
        key: 'copy',
        label: t('canvas.copy'),
        action: () => clipboard.copy(Array.from(view.selectedNodeIds)),
      })
      items.push({
        key: 'cut',
        label: t('canvas.cut'),
        action: () => {
          clipboard.cut(Array.from(view.selectedNodeIds))
          view.clearSelection()
        },
      })
    }

    // ── 粘贴（剪贴板有内容时可用）──
    if (clipboard.canPaste.value) {
      items.push({
        key: 'paste',
        label: t('canvas.paste'),
        action: () => {
          const ids = clipboard.paste(view.viewedNodeId)
          if (ids.length > 0) {
            view.clearSelection()
            view.setSelectedNodes(ids)
          }
        },
      })
    }

    // 无选中节点：仅在有可粘贴内容时显示"粘贴"，否则关闭菜单
    if (count === 0) {
      if (items.length === 0) {
        contextMenu.close()
        return
      }
      contextMenu.open(e.evt.clientX, e.evt.clientY, items)
      return
    }

    if (count === 1) {
      const nodeId = view.selectedNodeId
      items.push({
        key: 'enter-view',
        label: t('canvas.enterChildView'),
        action: () => link.enterNodeView(),
      })
      // 主视图：提供"展开/收起内联视图"（视图操作，不入 undo）
      if (nodeId && view.type === 'main') {
        if (view.getInlineViewRect(nodeId)) {
          // 已展开 -> 收起
          items.push({
            key: 'collapse-inline',
            label: t('canvas.collapseInlineView'),
            action: () => { link.toggleInlineView(nodeId) },
          })
          // 已展开 -> 自适应视图（以宽度为基准调整缩放与高度）
          items.push({
            key: 'fit-inline',
            label: t('canvas.fitView'),
            action: () => { link.fitInlineView(nodeId) },
          })
        } else {
          // 未展开 -> 展开
          items.push({
            key: 'expand-inline',
            label: t('canvas.expandInlineView'),
            action: () => { link.toggleInlineView(nodeId) },
          })
        }
      }
      // 有子节点时提供"清空子级"（删除子树，保留节点本身）
      if (nodeId && nodeStore.hasChildren(nodeId)) {
        items.push({
          key: 'clear-children',
          label: t('canvas.clearChildren'),
          danger: true,
          action: () => {
            if (nodeId) link.clearNodeChildren(nodeId)
          },
        })
      }
    } else {
      items.push({
        key: 'group',
        label: t('canvas.group'),
        action: () => link.groupSelectedNodes(),
      })
    }

    contextMenu.open(e.evt.clientX, e.evt.clientY, items)
  }

  return {
    handleStageClick,
    handleStageDblClick,
    handleStageContextMenu,
    /** 右键菜单状态（供画布组件渲染 ContextMenu） */
    contextMenu,
  }
}
