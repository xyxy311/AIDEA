/**
 * stores/plugin.ts —— 插件运行时的 pinia 状态
 *
 * 持有 PluginManager 实例与记录快照；负责 localStorage('aidea-plugins') 启停持久化。
 * 启动装载在 main.ts 的 `init()` 完成；运行时间表（setup 是否执行）由启动时的 enabled 快照决定。
 */
import { ref, reactive } from 'vue'
import { defineStore } from 'pinia'
import { PluginManager, collectPluginEntries } from '@/plugin/manager'
import type { PluginRecord } from '@/plugin/manager'
import { createPluginAdapter } from '@/plugin/adapter'
import type {
  PluginPanelEntry,
  PluginTopBarButtonEntry,
  PluginSettingsCategoryEntry,
  PluginPanelRegistration,
  PluginTopBarButtonRegistration,
  PluginSettingsCategoryRegistration,
} from '@/plugin/ui'
import { useLayoutStore } from '@/stores/layout'
import type { PanelKey } from '@/constants/panels'
import type { TopBarKey } from '@/constants/topbar'
// 依赖说明：layout store 经 uiMerge 反向 import 本 store，形成 plugin→layout→uiMerge→plugin
// 的环。但 useLayoutStore 仅在注册方法被**运行时**调用（插件 setup 期间）才求值，
// 模块顶层不执行，故静态 import 安全（不触发「初始化前访问」）。保持惰性级联即可。

const STORAGE_KEY = 'aidea-plugins'

/** 读取启停集合（id → enabled），坏数据兜底为空 */
function readEnabled(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

export const usePluginStore = defineStore('plugin', () => {
  const manager = ref<PluginManager | null>(null)
  const records = ref<PluginRecord[]>([])
  const ready = ref(false)

  // ── 插件 UI 注册表（reactive Map，深度响应式）──
  /** 插件面板注册表：key = `${pluginId}:${id}`，含 pluginId 回溯归因 */
  const uiPanels = reactive(new Map<string, PluginPanelEntry>())
  /** 插件顶栏按钮注册表：key = `${pluginId}:${id}` */
  const uiTopBarButtons = reactive(new Map<string, PluginTopBarButtonEntry>())
  /** 插件设置栏目注册表：key = `${pluginId}:${id}` */
  const uiSettingsCategories = reactive(new Map<string, PluginSettingsCategoryEntry>())

  /** 归一并注册插件面板；key 已存在 → warn 返回 false，不覆盖 */
  function registerUiPanel(pluginId: string, entry: PluginPanelRegistration): boolean {
    const key = `${pluginId}:${entry.id}`
    if (uiPanels.has(key)) {
      console.warn(`[plugin] 面板注册冲突：${key} 已存在，拒绝覆盖`)
      return false
    }
    uiPanels.set(key, { ...entry, key, pluginId })
    // 首次落位：把插件面板按默认放置侧加入布局（ensurePanel 幂等，已放置则不动）。
    // useLayoutStore 运行时求值，规避上方模块级循环依赖。
    useLayoutStore().ensurePanel(key as PanelKey, entry.defaultPlacement ?? 'right')
    return true
  }

  /** 归一并注册插件顶栏按钮；key 已存在 → warn 返回 false，不覆盖 */
  function registerUiTopBarButton(
    pluginId: string,
    entry: PluginTopBarButtonRegistration,
  ): boolean {
    const key = `${pluginId}:${entry.id}`
    if (uiTopBarButtons.has(key)) {
      console.warn(`[plugin] 顶栏按钮注册冲突：${key} 已存在，拒绝覆盖`)
      return false
    }
    // menu 的自引用 DropdownOption 类型会在任何结构性验算上触发「过深实例化」。
    // 采用逃生仓：先把 entry 收窄为 object 再组装，避免 TS 对递归类型做结构性展开。
    uiTopBarButtons.set(
      key,
      { key, pluginId, ...(entry as object) } as unknown as PluginTopBarButtonEntry,
    )
    // 首次落位：按默认放置区把插件按钮加入布局（ensureTop 幂等）。
    useLayoutStore().ensureTop(key as TopBarKey, entry.zone ?? 'left')
    return true
  }

  /** 归一并注册插件设置栏目；key 已存在 → warn 返回 false，不覆盖 */
  function registerUiSettingsCategory(
    pluginId: string,
    entry: PluginSettingsCategoryRegistration,
  ): boolean {
    const key = `${pluginId}:${entry.id}`
    if (uiSettingsCategories.has(key)) {
      console.warn(`[plugin] 设置栏目注册冲突：${key} 已存在，拒绝覆盖`)
      return false
    }
    uiSettingsCategories.set(key, { ...entry, key, pluginId })
    return true
  }

  /** 按插件批量清除其全部 UI 注册（setup 抛错回滚 / 错误恢复时调用） */
  function unregisterPluginUi(pluginId: string): void {
    for (const [key, e] of uiPanels) if (e.pluginId === pluginId) uiPanels.delete(key)
    for (const [key, e] of uiTopBarButtons) if (e.pluginId === pluginId) uiTopBarButtons.delete(key)
    for (const [key, e] of uiSettingsCategories) {
      if (e.pluginId === pluginId) uiSettingsCategories.delete(key)
    }
  }

  /** 引导装载插件（应用启动后调用一次） */
  async function init(): Promise<void> {
    if (manager.value) return
    const adapter = createPluginAdapter()
    const mgr = new PluginManager({
      entries: collectPluginEntries(),
      adapter,
      getEnabled: readEnabled,
    })
    mgr.onChange((snapshot) => {
      records.value = snapshot
    })
    manager.value = mgr
    await mgr.installAll()
    ready.value = true
  }

  /** 切换启停（**仅持久化 → 重启应用生效**），持久化写入在 store 落地。 */
  function setEnabled(id: string, enabled: boolean): void {
    const next = readEnabled()
    if (enabled) next[id] = true
    else delete next[id]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    manager.value?.setEnabled(id, enabled)
  }

  return {
    manager,
    records,
    ready,
    init,
    setEnabled,
    uiPanels,
    uiTopBarButtons,
    uiSettingsCategories,
    registerUiPanel,
    registerUiTopBarButton,
    registerUiSettingsCategory,
    unregisterPluginUi,
  }
})