import type { Component } from 'vue'
import { defineAsyncComponent } from 'vue'
import {
  BrushOutline,
  LayersOutline,
  KeypadOutline,
  PulseOutline,
  TerminalOutline,
} from '@vicons/ionicons5'
import AppearanceSection from '@/components/settings/AppearanceSection.vue'
import LayoutSection from '@/components/settings/LayoutSection.vue'
import ShortcutsSection from '@/components/settings/ShortcutsSection.vue'
import PluginsSection from '@/components/settings/PluginsSection.vue'

/**
 * MCP 分区经 defineAsyncComponent 惰性装配：
 * 静态 import 会形成 settings 品类表 → McpSection → mcp/host → plugin/adapter →
 * api/index → api/shortcuts → uiRegistry → settings 品类表 的静态环，
 * 使 api-shortcuts 单测在模块初始化期拿到未完成的 binding（createShortcutsApi undefined）。
 */
const McpSection = defineAsyncComponent(() => import('@/components/settings/McpSection.vue'))

/**
 * 内置设置分类品类表（单一数据源）：只描述「分类是什么」，由 uiRegistry 初始化时 seed 进登记表，
 * 插件栏目经适配层注册（key = `${pluginId}:${id}`）。新增分类只需在此登记 + 提供 Section 组件。
 */

/** 内置设置分类 id */
export type SettingsCategoryId = 'appearance' | 'layout' | 'shortcuts' | 'plugins' | 'mcp'

/** 设置分类品类定义 */
export interface SettingsDef {
  id: SettingsCategoryId
  /** 标题 i18n key（经 t() 读取显示文案） */
  titleKey: string
  /** 分区描述 i18n key（仅内置分类有） */
  descKey: string
  /** 分类图标 */
  icon: Component
  /** 右侧内容 Section 组件（纯内容，无自带 header） */
  component: Component
}

/** 全量内置设置分类表（顺序即导航展示顺序） */
export const SETTINGS_CATALOG: SettingsDef[] = [
  {
    id: 'appearance',
    titleKey: 'settings.appearance',
    descKey: 'settings.appearanceDesc',
    icon: BrushOutline,
    component: AppearanceSection,
  },
  {
    id: 'layout',
    titleKey: 'settings.layout',
    descKey: 'settings.layoutDesc',
    icon: LayersOutline,
    component: LayoutSection,
  },
  {
    id: 'shortcuts',
    titleKey: 'settings.shortcuts',
    descKey: 'settings.shortcutsDesc',
    icon: KeypadOutline,
    component: ShortcutsSection,
  },
  {
    id: 'plugins',
    titleKey: 'settings.plugins',
    descKey: 'settings.pluginsDesc',
    icon: PulseOutline,
    component: PluginsSection,
  },
  {
    id: 'mcp',
    titleKey: 'mcp.title',
    descKey: 'mcp.desc',
    icon: TerminalOutline,
    component: McpSection,
  },
]
