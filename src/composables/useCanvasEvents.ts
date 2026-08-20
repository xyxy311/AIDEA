import type { KonvaEventObject } from 'konva/lib/Node'
import { t } from '@/composables/useT'
import { useViewStore } from '@/stores/view'
import { useNodeStore } from '@/stores/node'
import { useCommands } from '@/composables/useCommands'
import { useContextMenu, type ContextMenuItem } from '@/composables/useContextMenu'
import { useNodeViewLink } from '@/composables/useNodeViewLink'
import { useClipboard } from '@/composables/useClipboard'
import { useAIWordPanel } from '@/composables/useAIWordPanel'
import { useAIDirectionsStore } from '@/stores/aiDirections'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'
import { snapPosition, snapFocus } from '@/utils/grid'

/**
 * 空白画布双击判定窗口（与 Konva.dblClickWindow 对齐，毫秒）
 */
const DBL_CLICK_WINDOW = 400

/**
 * 空白画布双击判定的两次单击之间的最大屏幕像素距离。
 * Konva 自带 dblclick 只做全局计时、不校验位置，会导致「第一次点击在别处/节点上、
 * 第二次落在空白」也误判为双击新建节点；这里手动配对两次空白单击并限制距离。
 */
const DBL_CLICK_DISTANCE = 12

/**
 * 画布事件处理
 *
 * @param viewId - 视图 ID（主视图传 'main'）
 *
 * 提供针对 v-stage 事件的回调：
 * - handleStageClick：点击空白区域取消选中；两次快速且邻近的空白单击视为「空白双击」，创建新节点（并进入编辑态）
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
  const aiWord = useAIWordPanel()
  const aiDirections = useAIDirectionsStore()

  /**
   * 上一次「空白画布单击」的记录（时间 + 屏幕坐标），用于手动判定空白双击。
   * 仅在本视图实例内共享，跨实例无关。
   */
  let lastEmptyClick: { time: number; screenX: number; screenY: number } | null = null

  /**
   * 处理画布点击事件
   * - 点击空白区域：取消选中
   * - 两次快速且邻近的空白单击：视为「空白双击」，创建新节点（并进入编辑态）
   *
   * Konva 自带的 dblclick 事件只做全局计时双点判定、不校验位置，会把
   * 「第一次点击落在节点/远处、第二次落在空白」误判为空白双击。此处手动配对
   * 两次空白单击（时间窗 + 屏幕距离），避免该误触发。
   */
  function handleStageClick(e: KonvaEventObject<MouseEvent>) {
    // 点击落在节点/形状上（含连线）：重置空白双击暂存，避免其与后续空白单击被误配成双击
    if (e.target !== e.currentTarget) {
      lastEmptyClick = null
      return
    }

    const stage = e.target.getStage()
    // 世界坐标：用于计算节点落点（已考虑 Stage 的 scale/offset）
    const world = stage?.getRelativePointerPosition()
    // 屏幕坐标：仅用于两次单击的距离判定（不受缩放影响）
    const screen = stage?.getPointerPosition()

    // 判定是否为「空白双击」：与上一次空白单击在时间窗内、且屏幕距离足够近
    const now = performance.now()
    const isDouble =
      lastEmptyClick !== null &&
      now - lastEmptyClick.time <= DBL_CLICK_WINDOW &&
      screen !== undefined &&
      screen !== null &&
      Math.abs(screen.x - lastEmptyClick.screenX) <= DBL_CLICK_DISTANCE &&
      Math.abs(screen.y - lastEmptyClick.screenY) <= DBL_CLICK_DISTANCE

    // 更新暂存，作为下一次判定的「前一次」点击
    lastEmptyClick = {
      time: now,
      screenX: screen?.x ?? 0,
      screenY: screen?.y ?? 0,
    }

    if (isDouble && world) {
      // 空白双击：创建新节点，并清空暂存，避免三连击再次触发
      lastEmptyClick = null

      // 减去半个节点尺寸，使节点的中心对齐鼠标光标位置
      const left = world.x - DEFAULT_NODE_WIDTH / 2
      const top = world.y - DEFAULT_NODE_HEIGHT / 2

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
    } else {
      // 空白单击：取消选中
      view.clearSelection()
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

    // ── AI 定向发散（有选中节点时追加「发散」父级子菜单）──
    // 以选中节点文本数组作为发散起点（保留非空过滤）；父项本身不执行，
    // 由 ContextMenu 展开子菜单，点击子项才触发对应方向。
    const from = Array.from(view.selectedNodeIds)
      .map((id) => nodeStore.getNode(id)?.text)
      .filter((s): s is string => !!s && s.trim().length > 0)
    const divergenceChildren: ContextMenuItem[] = [
      ...aiDirections.directionList.map((d) => ({
        key: `divergence-${d.id}`,
        label: d.title,
        action: () => { void aiWord.generateDirectional(from, d) },
      })),
    ]
    items.push({
      key: 'divergence',
      label: t('canvas.divergence'),
      children: divergenceChildren,
    })

    contextMenu.open(e.evt.clientX, e.evt.clientY, items)
  }

  return {
    handleStageClick,
    handleStageContextMenu,
    /** 右键菜单状态（供画布组件渲染 ContextMenu） */
    contextMenu,
  }
}
