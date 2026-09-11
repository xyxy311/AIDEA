import type { Component } from 'vue'
import OpenButton from '@/components/topbar/OpenButton.vue'
import SaveButton from '@/components/topbar/SaveButton.vue'
import UndoButton from '@/components/topbar/UndoButton.vue'
import RedoButton from '@/components/topbar/RedoButton.vue'
import SettingsButton from '@/components/topbar/SettingsButton.vue'
import DebugButton from '@/components/topbar/DebugButton.vue'
import GridButton from '@/components/topbar/GridButton.vue'
import AddNodeButton from '@/components/topbar/AddNodeButton.vue'

/**
 * 顶部栏按钮品类表（单一数据源）——模仿左右侧边栏的 PANEL_CATALOG
 *
 * 原「菜单栏 MenuBar」更名为 LeftTopBar（左顶部条），
 * 原「工具栏 Toolbar」更名为 RightTopBar（右顶部条）。
 * 两侧的功能图标按钮地位等价，只在布局层决定放左还是右。本表只描述「按钮是什么」：
 * - id：按钮标识
 * - titleKey：标题 i18n key（经 t() 读取显示文案）
 * - defaultZone：默认放置侧（'left' 左顶部条 / 'right' 右顶部条）
 * - component：按钮逻辑组件（纯动作逻辑，视觉外壳由通用按钮模板 TopBarButton 提供）
 *
 * 新增顶部功能按钮只需在此登记 + 提供对应按钮组件：
 * 左/右顶部条会按 layout store 的顺序自动渲染，拖拽排序 / 跨区放置自动生效。
 */
export type TopBarId =
  | 'open'
  | 'save'
  | 'undo'
  | 'redo'
  | 'settings'
  | 'debug'
  | 'grid'
  | 'add-node'

/** 插件顶栏按钮 key（注册表归一后的完整键：`${pluginId}:${id}`，插件经适配层注册） */
export type PluginTopBarKey = `${string}:${string}`

/** 顶栏按钮布局键：内置按钮 id 或插件按钮 key（layout store / 渲染层统一使用） */
export type TopBarKey = TopBarId | PluginTopBarKey

/** 顶部栏按钮放置侧 */
export type TopBarZone = 'left' | 'right'

/** 顶部栏按钮品类定义 */
export interface TopBarDef {
  id: TopBarId
  /** 标题 i18n key（经 t() 读取显示文案） */
  titleKey: string
  /** 默认放置侧 */
  defaultZone: TopBarZone
  /** 按钮逻辑组件（纯动作，视觉外壳由 TopBarButton 提供） */
  component: Component
}

/** 全量顶部栏按钮品类表（顺序即默认展示顺序） */
export const TOP_BAR_CATALOG: TopBarDef[] = [
  { id: 'open', titleKey: 'menuBar.open', defaultZone: 'left', component: OpenButton },
  { id: 'save', titleKey: 'menuBar.save', defaultZone: 'left', component: SaveButton },
  { id: 'undo', titleKey: 'menuBar.undo', defaultZone: 'left', component: UndoButton },
  { id: 'redo', titleKey: 'menuBar.redo', defaultZone: 'left', component: RedoButton },
  { id: 'settings', titleKey: 'menuBar.settings', defaultZone: 'left', component: SettingsButton },
  { id: 'debug', titleKey: 'toolbar.debug', defaultZone: 'right', component: DebugButton },
  { id: 'grid', titleKey: 'toolbar.grid', defaultZone: 'right', component: GridButton },
  { id: 'add-node', titleKey: 'toolbar.addNode', defaultZone: 'right', component: AddNodeButton },
]

/** 按钮 id -> 品类定义（快速索引） */
export const TOP_BAR_INDEX: Record<TopBarId, TopBarDef> = Object.fromEntries(
  TOP_BAR_CATALOG.map((b) => [b.id, b]),
) as Record<TopBarId, TopBarDef>

/** 按钮 id -> 逻辑组件 */
export const TOP_BAR_COMPONENTS: Record<TopBarId, Component> = Object.fromEntries(
  TOP_BAR_CATALOG.map((b) => [b.id, b.component]),
) as Record<TopBarId, Component>

/** 默认放在左侧顶部条的按钮 id（默认顺序 = 品类表顺序） */
export const DEFAULT_LEFT_TOP: TopBarId[] = TOP_BAR_CATALOG.filter(
  (b) => b.defaultZone === 'left',
).map((b) => b.id)

/** 默认放在右侧顶部条的按钮 id（默认顺序 = 品类表顺序） */
export const DEFAULT_RIGHT_TOP: TopBarId[] = TOP_BAR_CATALOG.filter(
  (b) => b.defaultZone === 'right',
).map((b) => b.id)