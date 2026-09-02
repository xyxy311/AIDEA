import type { Component } from 'vue'
import { defineComponent, h } from 'vue'
import {
  ListOutline,
  SearchOutline,
  ColorPaletteOutline,
  PricetagsOutline,
  OptionsOutline,
  SparklesOutline,
} from '@vicons/ionicons5'
import NodeTreePanel from '@/components/panels/NodeTreePanel.vue'
import ReferencesPanel from '@/components/panels/ReferencesPanel.vue'
import SearchPanel from '@/components/panels/SearchPanel.vue'
import PresetManagerPanel from '@/components/panels/PresetManagerPanel.vue'
import TagsPanel from '@/components/panels/TagsPanel.vue'
import PropertyPanel from '@/components/panels/PropertyPanel.vue'
import AIPanel from '@/components/panels/AIPanel.vue'

/**
 * 引用定义图标（#）。
 * ionicons5 无 hash 图标，用内联 SVG（stroke=currentColor，可随主题/激活态着色）。
 */
const HashIcon = defineComponent({
  name: 'HashIcon',
  render() {
    return h(
      'svg',
      {
        viewBox: '0 0 24 24',
        xmlns: 'http://www.w3.org/2000/svg',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      },
      [
        h('line', { x1: '4', y1: '9', x2: '20', y2: '9' }),
        h('line', { x1: '4', y1: '15', x2: '20', y2: '15' }),
        h('line', { x1: '10', y1: '3', x2: '8', y2: '21' }),
        h('line', { x1: '16', y1: '3', x2: '14', y2: '21' }),
      ],
    )
  },
})

/**
 * 全量面板品类表（单一数据源）
 *
 * 所有面板地位等价，仅在布局层决定放左侧还是右侧。本表只描述「面板是什么」，
 * 不绑定任何布局区：
 * - id：面板标识
 * - titleKey：标题 i18n key（经 t() 读取显示文案）
 * - icon：活动栏 / 面板标题栏共用的图标（单一来源）
 * - component：面板内容组件（纯内容，无自带 header）
 * - defaultPlacement：默认放置侧（'left' 活动栏单面板区 / 'right' 多面板 dock）
 *
 * 新增面板只需在此登记，活动栏图标、左侧面板区、右侧 dock、左右互通自动生效。
 * 面板归属 / 顺序 / 激活等布局状态由 layout store 管理，不在此持久化。
 */
export type PanelId = 'nodeTree' | 'references' | 'search' | 'presets' | 'tags' | 'property' | 'ai'

/** 插件面板 key（注册表归一后的完整键：`${pluginId}:${id}`，插件经适配层注册） */
export type PluginPanelKey = `${string}:${string}`

/** 面板布局键：内置面板 id 或插件面板 key（layout store / 渲染层统一使用） */
export type PanelKey = PanelId | PluginPanelKey

/** 面板默认放置侧 */
export type PanelPlacement = 'left' | 'right'

/** 面板品类定义 */
export interface PanelDef {
  id: PanelId
  /** i18n key（经 t() 读取显示文案） */
  titleKey: string
  /** 活动栏 / 面板标题栏共用图标 */
  icon: Component
  /** 面板内容组件（纯内容，无自带 header） */
  component: Component
  /** 默认放置侧 */
  defaultPlacement: PanelPlacement
}

/** 全量面板品类表（顺序即默认展示顺序） */
export const PANEL_CATALOG: PanelDef[] = [
  { id: 'nodeTree', titleKey: 'leftSidebar.nodeTree', icon: ListOutline, component: NodeTreePanel, defaultPlacement: 'left' },
  { id: 'references', titleKey: 'leftSidebar.references', icon: HashIcon, component: ReferencesPanel, defaultPlacement: 'left' },
  { id: 'search', titleKey: 'leftSidebar.search', icon: SearchOutline, component: SearchPanel, defaultPlacement: 'left' },
  { id: 'tags', titleKey: 'leftSidebar.tags', icon: PricetagsOutline, component: TagsPanel, defaultPlacement: 'left' },
  { id: 'property', titleKey: 'rightSidebar.property', icon: OptionsOutline, component: PropertyPanel, defaultPlacement: 'right' },
  { id: 'presets', titleKey: 'leftSidebar.presets', icon: ColorPaletteOutline, component: PresetManagerPanel, defaultPlacement: 'right' },
  { id: 'ai', titleKey: 'leftSidebar.ai', icon: SparklesOutline, component: AIPanel, defaultPlacement: 'left' },
]

/** 面板 id -> 品类定义（快速索引） */
export const PANEL_INDEX: Record<PanelId, PanelDef> = Object.fromEntries(
  PANEL_CATALOG.map((p) => [p.id, p]),
) as Record<PanelId, PanelDef>

/** 面板 id -> 内容组件 */
export const PANEL_COMPONENTS: Record<PanelId, Component> = Object.fromEntries(
  PANEL_CATALOG.map((p) => [p.id, p.component]),
) as Record<PanelId, Component>

/** 默认放置在左侧的面板 id（活动栏单面板区） */
export const DEFAULT_LEFT_PANELS: PanelId[] = PANEL_CATALOG.filter(
  (p) => p.defaultPlacement === 'left',
).map((p) => p.id)

/** 默认放置在右侧的面板 id（多面板 dock） */
export const DEFAULT_RIGHT_PANELS: PanelId[] = PANEL_CATALOG.filter(
  (p) => p.defaultPlacement === 'right',
).map((p) => p.id)