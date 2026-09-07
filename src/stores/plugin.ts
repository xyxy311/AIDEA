/**
 * stores/plugin.ts —— 插件运行时的 pinia 状态
 *
 * 持有 PluginManager 实例与记录快照；负责 localStorage('aidea-plugins') 启停持久化。
 * 启动装载在 main.ts 的 `init()` 完成；运行时间表（setup 是否执行）由启动时的 enabled 快照决定。
 *
 * 注意：插件 UI 注册（面板 / 顶栏按钮 / 设置栏目）已不再经本 store——
 * 注册去向往 **uiRegistry 登记总表**（stores/uiRegistry.ts），layout 纯派生自动生效。
 * 本 store 从 plugin→layout→uiMerge→plugin 的环中解脱，只管「启停 + 生命周期记录」。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { PluginManager, collectPluginEntries } from '@/plugin/manager'
import type { PluginRecord } from '@/plugin/manager'

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

  /** 引导装载插件（应用启动后调用一次） */
  async function init(): Promise<void> {
    if (manager.value) return
    const mgr = new PluginManager({
      entries: collectPluginEntries(),
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
  }
})