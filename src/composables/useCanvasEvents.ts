import type { KonvaEventObject } from 'konva/lib/Node'
import { t } from '@/composables/useT'
import { useViewStore } from '@/stores/view'
import { useNodeStore } from '@/stores/node'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { useCommands } from '@/composables/useCommands'
import { useContextMenu, type ContextMenuItem } from '@/composables/useContextMenu'
import { useNodeViewLink } from '@/composables/useNodeViewLink'
import { useClipboard } from '@/composables/useClipboard'
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
 * 画布事件处理：空白单击取消选中、空白双击建节点、右键上下文菜单。
 * 右键菜单按选中状态生成内置项，并追加插件注册项（scope 过滤 + when 守卫）。
 */
export function useCanvasEvents(viewId: string) {
  const view = useViewStore(viewId)
  const nodeStore = useNodeStore()
  const contextMenu = useContextMenu()
  const link = useNodeViewLink(viewId)
  const commands = useCommands()
  const clipboard = useClipboard()
  const uiRegistry = useUiRegistryStore()

  /**
   * 上一次「空白画布单击」的记录（时间 + 屏幕坐标），用于手动判定空白双击。
   * 仅在本视图实例内共享，跨实例无关。
   */
  let lastEmptyClick: { time: number; screenX: number; screenY: number } | null = null

  /**
   * 把插件注册的右键菜单项追加到 items 末尾：按 scope 过滤 + when 守卫；
   * 带 children 工厂的产出分组父项（子项经工厂现场求值）；其余转为扁平项。
   */
  function appendPluginContextMenuItems(
    target: ContextMenuItem[],
    scope: 'canvas' | 'selection',
    selectedNodeIds: string[],
  ): void {
    for (const entry of uiRegistry.contextMenuItems.values()) {
      const def = entry.def
      if (def.scope !== scope) continue
      if (def.when?.({ selectedNodeIds }) === false) continue
      // 带 children 工厂：父项仅作分组入口（与 run 互斥，不挂 action，点击不触发执行），
      // 子项经工厂现场求值（收与 run 相同的选中上下文，展开拷贝），字段同名透传为叶子菜单项
      if (def.children) {
        target.push({
          key: entry.key,
          label: def.label,
          danger: def.danger,
          icon: def.icon,
          children: def.children({ selectedNodeIds: [...selectedNodeIds] }).map((c) => ({
            key: c.key,
            label: c.label,
            icon: c.icon,
            danger: c.danger,
            action: c.action,
          })),
        })
        continue
      }
      target.push({
        key: entry.key,
        label: def.label,
        danger: def.danger,
        icon: def.icon,
        action: () => def.run({ selectedNodeIds: [...selectedNodeIds] }),
      })
    }
  }

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
   * 追加"删除"菜单项（无图标，danger 样式，位于内建菜单项末尾、插件项之前）：
   * 存在选中节点时删除选中节点，存在选中连线时删除选中连线，然后清空选中。
   */
  function appendDelete(target: ContextMenuItem[]): void {
    target.push({
      key: 'delete',
      label: t('canvas.delete'),
      danger: true,
      action: () => {
        if (view.selectedNodeIds.size > 0) {
          commands.deleteNodes(Array.from(view.selectedNodeIds))
        }
        if (view.selectedConnectionIds.size > 0) {
          commands.deleteConnectionsByIds(Array.from(view.selectedConnectionIds))
        }
        view.clearSelection()
      },
    })
  }

  /**
   * 处理画布右键菜单事件：阻止默认菜单，按选中状态弹出对应菜单项。
   */
  function handleStageContextMenu(e: KonvaEventObject<MouseEvent>) {
    e.evt.preventDefault()

    const count = view.selectedNodeIds.size
    const connCount = view.selectedConnectionIds.size

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

    // 无选中节点：删除（内建项，位于插件项之前）+ 插件画布级（scope='canvas'）菜单项
    if (count === 0) {
      if (connCount > 0) appendDelete(items)
      appendPluginContextMenuItems(items, 'canvas', [])
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

    // ── 删除（有选中节点时可用）：内建项末尾、插件项之前 ──
    if (count > 0) appendDelete(items)

    // ── 插件注册的选中级（scope='selection'）菜单项：追加在内建项之后 ──
    appendPluginContextMenuItems(items, 'selection', Array.from(view.selectedNodeIds))

    contextMenu.open(e.evt.clientX, e.evt.clientY, items)
  }

  return {
    handleStageClick,
    handleStageContextMenu,
    /** 右键菜单状态（供画布组件渲染 ContextMenu） */
    contextMenu,
  }
}
