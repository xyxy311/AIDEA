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
import { isDesktopRuntime, subscribePluginChanges } from '@/plugin/sources'
import { useLayoutStore } from '@/stores/layout'

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
  /** 插件目录脏标记（M2）：仅桌面桥推送置位；web 无桥 → 恒 false（全程无感知） */
  const dirDirty = ref(false)
  /** 桥推送的变更插件 id 列表（M2 预留：当前仅置位 dirDirty，不触发重扫） */
  const changedIds = ref<string[]>([])

  /** 引导装载插件（应用启动后调用一次；收集为 async：内置 glob + 桌面桥扫描） */
  async function init(): Promise<void> {
    if (manager.value) return
    // 桌面运行态订阅插件目录变更推送（main watch → 桥推送，M2）：
    // 仅置脏标记，不做热重扫/热卸载——插件启停语义固定为「重启应用生效」。
    // 应用生命周期订阅，不退订（init 全程只跑一次，与进程同生命周期）。
    if (isDesktopRuntime) {
      subscribePluginChanges((ids) => {
        dirDirty.value = true
        changedIds.value = ids
      })
    }
    // 收集聚合条目（无桌面桥 = web → 桌面源空集，只装内置）
    const entries = await collectPluginEntries()
    // 先回填布局发现集（重清洗 delta），再构造 manager 装载注册 UI——
    // 面板 / 顶栏按钮的位置 delta 在注册前即已正确（禁用→启用不丢布局）
    useLayoutStore().setDiscoveredPluginIds(entries.map((e) => e.id))
    const mgr = new PluginManager({
      entries,
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
    dirDirty,
    changedIds,
    init,
    setEnabled,
  }
})