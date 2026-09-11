import type { Component } from 'vue'
import {
  BrushOutline,
  LayersOutline,
  KeypadOutline,
  PulseOutline,
} from '@vicons/ionicons5'
import AppearanceSection from '@/components/settings/AppearanceSection.vue'
import LayoutSection from '@/components/settings/LayoutSection.vue'
import ShortcutsSection from '@/components/settings/ShortcutsSection.vue'
import PluginsSection from '@/components/settings/PluginsSection.vue'

/**
 * 内置设置分类品类表（单一数据源）
 *
 * 与 PANEL_CATALOG / TOP_BAR_CATALOG 同角色：只描述「分类是什么」，
 * 由 uiRegistry store 在初始化时 seed 进统一登记表；插件设置栏目经
 * 适配层注册进同一张表（key = `${pluginId}:${id}`）。
 *
 * 新增设置分类只需在此登记 + 提供对应 Section 组件（纯内容，import settings-shared.css），
 * SettingsModal 左侧导航与右侧内容区自动生效。
 */

/** 内置设置分类 id */
export type SettingsCategoryId = 'appearance' | 'layout' | 'shortcuts' | 'plugins'

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
]
