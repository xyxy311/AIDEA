/**
 * uiMerge.ts —— 合并层（并发/渲染点的唯一新依赖）
 *
 * 把「内置目录表」（PANEL_CATALOG / TOP_BAR_CATALOG）与「插件运行时 UI 注册表」
 * 合并为派生元信息，供 ActivityBar / DockPanel / TopBarZone / SettingsModal 统一取用。
 * 渲染点只依赖本文件，不再直连内置目录表。
 *
 * 合并规则：内置优先（id 不含 ':'，插件 key 含 ':' 天然不冲突），插件兜底。
 * computed 内遍历 reactive Map，保持响应性。
 *
 * 注意：SettingsModal 的内置分类仍由其自身持有；为避免反向 import 造成耦合，
 * 本文件只暴露插件设置栏目（useMergedPluginSettingsCategories）。
 */
import { computed } from 'vue'
import type { ComputedRef, Component } from 'vue'
import { PANEL_CATALOG } from '@/constants/panels'
import type { PanelKey } from '@/constants/panels'
import { TOP_BAR_CATALOG } from '@/constants/topbar'
import type { TopBarKey } from '@/constants/topbar'
import { usePluginStore } from '@/stores/plugin'
import { wrapTopBarButton } from './ui'

// ── 合并后的元信息（统一供渲染点消费）──

/** 渲染面板元信息：内置（titleKey/icon/...）或插件（title/component/...） */
export interface PanelMeta {
  id: PanelKey
  /** 内置才有（i18n key） */
  titleKey?: string
  /** 插件才有（字符串标题，覆盖 titleKey） */
  title?: string
  icon: Component
  component: Component
  defaultPlacement: 'left' | 'right'
  /** 标记插件来源（错误边界 / 隔离用） */
  pluginId?: string
}

/** 渲染顶栏按钮元信息：内置（titleKey/component）或插件（title/换包 component） */
export interface TopBarMeta {
  id: TopBarKey
  titleKey?: string
  title?: string
  component: Component
  pluginId?: string
}

/** 渲染设置栏目元信息 */
export interface SettingsCategoryMeta {
  id: string
  titleKey?: string
  title?: string
  component: Component
  pluginId?: string
}

// ── 合并 Composables ──

/** 合并面板目录：内置 PANEL_CATALOG 先入，插件 uiPanels 兜底。 */
export function useMergedPanelIndex(): ComputedRef<Map<PanelKey, PanelMeta>> {
  const pluginStore = usePluginStore()
  return computed(() => {
    const map = new Map<PanelKey, PanelMeta>()
    for (const p of PANEL_CATALOG) {
      map.set(p.id, {
        id: p.id,
        titleKey: p.titleKey,
        icon: p.icon,
        component: p.component,
        defaultPlacement: p.defaultPlacement,
      })
    }
    for (const entry of pluginStore.uiPanels.values()) {
      const key = entry.key as PanelKey // entry.key: string，但运行时恒为 `${pluginId}:${id}`
      if (map.has(key)) continue // 保险：内置 id 天然不含 ':'，按理不冲突
      map.set(key, {
        id: key,
        title: entry.title,
        icon: entry.icon,
        component: entry.component,
        defaultPlacement: entry.defaultPlacement ?? 'right',
        pluginId: entry.pluginId,
      })
    }
    return map
  })
}

/** 合并顶栏按钮目录：内置 TOP_BAR_CATALOG，插件经 wrapTopBarButton 包装为逻辑组件。 */
export function useMergedTopBarIndex(): ComputedRef<Map<TopBarKey, TopBarMeta>> {
  const pluginStore = usePluginStore()
  return computed(() => {
    const map = new Map<TopBarKey, TopBarMeta>()
    for (const b of TOP_BAR_CATALOG) {
      map.set(b.id, { id: b.id, titleKey: b.titleKey, component: b.component })
    }
    for (const entry of pluginStore.uiTopBarButtons.values()) {
      const key = entry.key as TopBarKey // entry.key: string，但运行时恒为 `${pluginId}:${id}`
      if (map.has(key)) continue
      map.set(key, {
        id: key,
        title: entry.title,
        component: wrapTopBarButton(entry),
        pluginId: entry.pluginId,
      })
    }
    return map
  })
}

/**
 * 插件设置栏目列表（仅插件，不含内置）。
 * 内置设置分类由 SettingsModal 自身持有；此处只负责插件部分，
 * 由 SettingsModal 在「内置组 → 分隔线 → 插件组」时取用。
 */
export function useMergedPluginSettingsCategories(): ComputedRef<SettingsCategoryMeta[]> {
  const pluginStore = usePluginStore()
  return computed(() => {
    const list: SettingsCategoryMeta[] = []
    for (const entry of pluginStore.uiSettingsCategories.values()) {
      list.push({
        id: entry.key,
        title: entry.title,
        component: entry.component,
        pluginId: entry.pluginId,
      })
    }
    return list
  })
}

/** 单面板元信息解析（渲染点便捷封装）。无元信息（未注册 / 已隐藏）返回 undefined。 */
export function usePanelMeta(id: PanelKey | null): ComputedRef<PanelMeta | undefined> {
  const merged = useMergedPanelIndex()
  return computed(() => (id === null ? undefined : merged.value.get(id)))
}