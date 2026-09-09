/**
 * uiRegistry —— UI 登记总表（面板 / 顶栏按钮 / 设置栏目 / 快捷键动作 / 右键菜单项 / 模态面板）
 *
 * 全应用唯一的「UI 元素登记表」：内置目录（PANEL_CATALOG / TOP_BAR_CATALOG /
 * SETTINGS_CATALOG）在 store 初始化时 seed 进表，插件经注册面（ctx.register →
 * plugin/ui.ts）把运行时组件 / 动作注册进**同一张表**。条目带 origin（builtin | plugin）与 pluginId 归因，
 * 供布局派生、恢复默认、错误隔离按来源过滤。
 * 快捷键动作与右键菜单项两表只收插件条目（内置动作在 CUSTOM_SHORTCUTS、内置菜单项
 * 在 useCanvasEvents 构建处，均不走登记表）。模态面板表同样只收插件条目，且不进
 * dock/活动栏布局派生体系（只登记，打开/关闭运行时另行实现）。
 *
 * 分层：
 * - constants 品类表保持纯数据（不持有运行时状态）；
 * - 本表是登记记录（只增删条目，不管排布）；
 * - 排布（顺序 / 归属 / 激活 / 持久化）在 layout store，渲染组件从 layout 派生目录读取。
 *
 * 响应性：reactive Map（深度），computed 内遍历可追踪；插件注册 / 回滚即时反映到布局。
 */
import { reactive } from 'vue'
import { defineStore } from 'pinia'
import type { Component } from 'vue'
import { PANEL_CATALOG } from '@/constants/panels'
import type { PanelKey } from '@/constants/panels'
import { TOP_BAR_CATALOG } from '@/constants/topbar'
import type { TopBarKey, TopBarZone } from '@/constants/topbar'
import { SETTINGS_CATALOG } from '@/constants/settings'
import type { ModalRegistration } from '@/types/modal'
import type {
  PluginPanelRegistration,
  PluginSettingsCategoryRegistration,
  PluginShortcutActionRegistration,
  PluginContextMenuItemRegistration,
} from '@/plugin/ui'

// ── 登记条目类型（统一形态，内置与插件共用）──

/** 条目来源 */
export type UiOrigin = 'builtin' | 'plugin'

/** 面板登记条目 */
export interface UiPanelEntry {
  /** 完整键：内置 = PanelId；插件 = `${pluginId}:${id}` */
  key: PanelKey
  origin: UiOrigin
  /** 插件条目才有（错误隔离 / 归因回滚用） */
  pluginId?: string
  /** 内置才有（i18n key） */
  titleKey?: string
  /** 插件才有（纯字符串标题） */
  title?: string
  icon: Component
  component: Component
  defaultPlacement: 'left' | 'right'
}

/** 顶栏按钮登记条目（component 均为逻辑组件：内置原样、插件经 wrapTopBarButton 包装） */
export interface UiTopBarEntry {
  key: TopBarKey
  origin: UiOrigin
  pluginId?: string
  titleKey?: string
  title?: string
  component: Component
  defaultZone: TopBarZone
}

/** 设置栏目登记条目 */
export interface UiSettingsEntry {
  key: string
  origin: UiOrigin
  pluginId?: string
  titleKey?: string
  descKey?: string
  title?: string
  icon?: Component
  component: Component
}

/** 插件顶栏按钮注册入参（描述符已由 plugin/ui.ts 包装为逻辑组件） */
export interface PluginTopBarButtonRegistered {
  /** 插件内短 id */
  id: string
  /** tooltip 文案 */
  title: string
  /** 已包装的逻辑组件（TopBarButton 外壳，onClick 已隔离） */
  component: Component
  defaultZone: TopBarZone
}

/** 快捷键动作 / 右键菜单项登记结果（两新表的注册方法返回值） */
export type UiRegisterResult = { ok: true } | { ok: false; conflict: 'id' }

/** 快捷键动作登记条目（仅插件条目；内置动作在 constants/shortcuts.ts 的 CUSTOM_SHORTCUTS） */
export interface UiShortcutActionEntry {
  /** 完整键：`${pluginId}:${id}` */
  key: string
  origin: UiOrigin
  pluginId?: string
  /** 插件动作定义（label 为成品字符串，defaultChord 可选） */
  def: PluginShortcutActionRegistration
}

/** 右键菜单项登记条目（仅插件条目；内置菜单项在 useCanvasEvents 构建处硬编码） */
export interface UiContextMenuItemEntry {
  /** 完整键：`${pluginId}:${id}` */
  key: string
  origin: UiOrigin
  pluginId?: string
  /** 插件菜单项定义（label 为成品字符串） */
  def: PluginContextMenuItemRegistration
}

/** 模态面板登记条目（仅插件条目；模态不进 dock/活动栏布局体系，只登记不派生布局） */
export interface UiModalEntry {
  /** 完整键：`${pluginId}:${id}` */
  key: string
  origin: UiOrigin
  pluginId?: string
  /** 插件模态面板定义（title 为成品字符串，component 为纯内容组件，width 可选） */
  def: ModalRegistration
}

// ── 内部校验 ──

/** id 合法性：非空 + 不含 ':' + 不含空白（pluginId 与短 id 同规则） */
function isValidId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && !id.includes(':') && !/\s/.test(id)
}

/** 插件条目归一键（模板字面量类型，可赋给 PanelKey / TopBarKey） */
function pluginKey(pluginId: string, id: string): `${string}:${string}` {
  return `${pluginId}:${id}`
}

export const useUiRegistryStore = defineStore('uiRegistry', () => {
  // ── 登记表（reactive Map，插入顺序 = 默认展示顺序）──
  const panels = reactive(new Map<string, UiPanelEntry>())
  const topBarButtons = reactive(new Map<string, UiTopBarEntry>())
  const settingsCategories = reactive(new Map<string, UiSettingsEntry>())
  // 三新表只收插件条目（内置动作 / 内置菜单项不走登记表，模态无内置目录，见各表类型注释）
  const shortcutActions = reactive(new Map<string, UiShortcutActionEntry>())
  const contextMenuItems = reactive(new Map<string, UiContextMenuItemEntry>())
  const modals = reactive(new Map<string, UiModalEntry>())

  /** seed 内置目录（store 创建时执行一次；reset 后重跑） */
  function seedBuiltins(): void {
    for (const def of PANEL_CATALOG) {
      panels.set(def.id, {
        key: def.id,
        origin: 'builtin',
        titleKey: def.titleKey,
        icon: def.icon,
        component: def.component,
        defaultPlacement: def.defaultPlacement,
      })
    }
    for (const def of TOP_BAR_CATALOG) {
      topBarButtons.set(def.id, {
        key: def.id,
        origin: 'builtin',
        titleKey: def.titleKey,
        component: def.component,
        defaultZone: def.defaultZone,
      })
    }
    for (const def of SETTINGS_CATALOG) {
      settingsCategories.set(def.id, {
        key: def.id,
        origin: 'builtin',
        titleKey: def.titleKey,
        descKey: def.descKey,
        icon: def.icon,
        component: def.component,
      })
    }
  }
  seedBuiltins()

  // ── 插件注册（冲突拒绝：warn + 返回 false，不覆盖）──

  /** 注册插件面板；key 冲突 / 非法 id → false */
  function registerPluginPanel(pluginId: string, reg: PluginPanelRegistration): boolean {
    if (!isValidId(pluginId) || !isValidId(reg.id)) {
      console.warn(`[uiRegistry] 插件「${pluginId}」面板「${reg.id}」注册失败：id 非法`)
      return false
    }
    const key = pluginKey(pluginId, reg.id)
    if (panels.has(key)) {
      console.warn(`[uiRegistry] 面板注册冲突：${key} 已存在，拒绝覆盖`)
      return false
    }
    panels.set(key, {
      key,
      origin: 'plugin',
      pluginId,
      title: reg.title,
      icon: reg.icon,
      component: reg.component,
      defaultPlacement: reg.defaultPlacement ?? 'right',
    })
    return true
  }

  /** 注册插件顶栏按钮（component 须已由 plugin/ui.ts 包装）；冲突 / 非法 id → false */
  function registerPluginTopBarButton(pluginId: string, reg: PluginTopBarButtonRegistered): boolean {
    if (!isValidId(pluginId) || !isValidId(reg.id)) {
      console.warn(`[uiRegistry] 插件「${pluginId}」顶栏按钮「${reg.id}」注册失败：id 非法`)
      return false
    }
    const key = pluginKey(pluginId, reg.id)
    if (topBarButtons.has(key)) {
      console.warn(`[uiRegistry] 顶栏按钮注册冲突：${key} 已存在，拒绝覆盖`)
      return false
    }
    topBarButtons.set(key, {
      key,
      origin: 'plugin',
      pluginId,
      title: reg.title,
      component: reg.component,
      defaultZone: reg.defaultZone,
    })
    return true
  }

  /** 注册插件设置栏目；冲突 / 非法 id → false */
  function registerPluginSettingsCategory(pluginId: string, reg: PluginSettingsCategoryRegistration): boolean {
    if (!isValidId(pluginId) || !isValidId(reg.id)) {
      console.warn(`[uiRegistry] 插件「${pluginId}」设置栏目「${reg.id}」注册失败：id 非法`)
      return false
    }
    const key = pluginKey(pluginId, reg.id)
    if (settingsCategories.has(key)) {
      console.warn(`[uiRegistry] 设置栏目注册冲突：${key} 已存在，拒绝覆盖`)
      return false
    }
    settingsCategories.set(key, {
      key,
      origin: 'plugin',
      pluginId,
      title: reg.title,
      component: reg.component,
    })
    return true
  }

  /** 注册插件快捷键动作；非法 id / key 冲突 → warn + { ok:false, conflict:'id' } */
  function registerPluginShortcutAction(pluginId: string, def: PluginShortcutActionRegistration): UiRegisterResult {
    if (!isValidId(pluginId) || !isValidId(def.id)) {
      console.warn(`[uiRegistry] 插件「${pluginId}」快捷键动作「${def.id}」注册失败：id 非法`)
      return { ok: false, conflict: 'id' }
    }
    const key = pluginKey(pluginId, def.id)
    if (shortcutActions.has(key)) {
      console.warn(`[uiRegistry] 快捷键动作注册冲突：${key} 已存在，拒绝覆盖`)
      return { ok: false, conflict: 'id' }
    }
    shortcutActions.set(key, { key, origin: 'plugin', pluginId, def })
    return { ok: true }
  }

  /** 注册插件右键菜单项；非法 id / key 冲突 → warn + { ok:false, conflict:'id' } */
  function registerPluginContextMenuItem(pluginId: string, def: PluginContextMenuItemRegistration): UiRegisterResult {
    if (!isValidId(pluginId) || !isValidId(def.id)) {
      console.warn(`[uiRegistry] 插件「${pluginId}」右键菜单项「${def.id}」注册失败：id 非法`)
      return { ok: false, conflict: 'id' }
    }
    const key = pluginKey(pluginId, def.id)
    if (contextMenuItems.has(key)) {
      console.warn(`[uiRegistry] 右键菜单项注册冲突：${key} 已存在，拒绝覆盖`)
      return { ok: false, conflict: 'id' }
    }
    contextMenuItems.set(key, { key, origin: 'plugin', pluginId, def })
    return { ok: true }
  }

  /** 注册插件模态面板；非法 id / key 冲突 → warn + { ok:false, conflict:'id' } */
  function registerPluginModal(pluginId: string, def: ModalRegistration): UiRegisterResult {
    if (!isValidId(pluginId) || !isValidId(def.id)) {
      console.warn(`[uiRegistry] 插件「${pluginId}」模态面板「${def.id}」注册失败：id 非法`)
      return { ok: false, conflict: 'id' }
    }
    const key = pluginKey(pluginId, def.id)
    if (modals.has(key)) {
      console.warn(`[uiRegistry] 模态面板注册冲突：${key} 已存在，拒绝覆盖`)
      return { ok: false, conflict: 'id' }
    }
    modals.set(key, { key, origin: 'plugin', pluginId, def })
    return { ok: true }
  }

  /** 按插件批量移除全部登记（setup 抛错回滚 / 清理）；不做任何布局操作（布局派生自动收缩） */
  function removePlugin(pluginId: string): void {
    for (const [key, e] of panels) if (e.pluginId === pluginId) panels.delete(key)
    for (const [key, e] of topBarButtons) if (e.pluginId === pluginId) topBarButtons.delete(key)
    for (const [key, e] of settingsCategories) if (e.pluginId === pluginId) settingsCategories.delete(key)
    for (const [key, e] of shortcutActions) if (e.pluginId === pluginId) shortcutActions.delete(key)
    for (const [key, e] of contextMenuItems) if (e.pluginId === pluginId) contextMenuItems.delete(key)
    for (const [key, e] of modals) if (e.pluginId === pluginId) modals.delete(key)
  }

  /** 清空并重置为内置目录（测试用） */
  function reset(): void {
    panels.clear()
    topBarButtons.clear()
    settingsCategories.clear()
    shortcutActions.clear()
    contextMenuItems.clear()
    modals.clear()
    seedBuiltins()
  }

  return {
    panels,
    topBarButtons,
    settingsCategories,
    shortcutActions,
    contextMenuItems,
    modals,
    registerPluginPanel,
    registerPluginTopBarButton,
    registerPluginSettingsCategory,
    registerPluginShortcutAction,
    registerPluginContextMenuItem,
    registerPluginModal,
    removePlugin,
    reset,
  }
})
