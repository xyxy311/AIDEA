import type { Component } from 'vue'
import { defineComponent, h } from 'vue'
import { ListOutline } from '@vicons/ionicons5'
import NodeTreePanel from '@/components/panels/NodeTreePanel.vue'
import ReferencesPanel from '@/components/panels/ReferencesPanel.vue'

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
 * 左侧活动栏面板注册表
 *
 * 面板注册表 = 单一数据源：
 * - PANEL_REGISTRY：活动栏上展示的图标 / 标题（顺序即默认展示顺序）
 * - PANEL_COMPONENTS：面板 id -> 渲染组件
 *
 * 新增面板只需在此注册 id + 图标 + 组件，活动栏与面板容器自动渲染。
 * 面板顺序（拖拽排序）与激活状态由 layout store 管理，不在此处持久化。
 */
export type PanelId = 'nodeTree' | 'references'

/** 面板元信息 */
export interface PanelMeta {
  id: PanelId
  /** i18n key（经 t() 读取显示文案） */
  titleKey: string
  /** 活动栏图标 */
  icon: Component
}

/** 活动栏面板注册表（顺序即默认展示顺序） */
export const PANEL_REGISTRY: PanelMeta[] = [
  { id: 'nodeTree', titleKey: 'leftSidebar.nodeTree', icon: ListOutline },
  { id: 'references', titleKey: 'leftSidebar.references', icon: HashIcon },
]

/** 面板 id -> 渲染组件 */
export const PANEL_COMPONENTS: Record<PanelId, Component> = {
  nodeTree: NodeTreePanel,
  references: ReferencesPanel,
}