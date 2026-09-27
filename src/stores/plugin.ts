/**
 * stores/plugin.ts —— 插件运行时的 pinia 状态（持有 PluginManager 与记录快照，localStorage 启停持久化）。
 * 插件 UI 注册已去向往 uiRegistry 登记总表，本 store 只管「启停 + 生命周期记录」。启动装载在 main.ts 的 init() 完成。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { PluginManager, collectPluginEntries } from '@/plugin/manager'
import type { PluginRecord } from '@/plugin/manager'
import { subscribePluginChanges } from '@/plugin/sources'
import { useLayoutStore } from '@/stores/layout'
import { useModalStore, SETTINGS_MODAL_KEY } from '@/stores/modal'
import { usePluginFloatingStore } from '@/stores/pluginFloating'

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
  /** 插件目录脏标记（M2）：由桌面桥推送置位（纯桌面形态恒有桥） */
  const dirDirty = ref(false)
  /** 桥推送的变更插件 id 列表（M2 预留：当前仅置位 dirDirty，不触发重扫） */
  const changedIds = ref<string[]>([])
  /** 重新加载进行中（每次 reload 期间为 true，UI 据此禁用交互并展示装载中） */
  const reloading = ref(false)

  /**
   * 重建并装载（init 与 reload 共用的装载主体）
   */
  async function bootstrap(): Promise<void> {
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
  }

  /** 引导装载插件（应用启动后调用一次；init 只在 manager 为空时装载） */
  async function init(): Promise<void> {
    if (manager.value) return
    // 订阅插件目录变更推送：
    // 仅置脏标记，不做自动热重扫（用户可在管理面板手动「重新加载」生效）。
    // 应用生命周期订阅，不退订（init 全程只跑一次，与进程同生命周期）。
    subscribePluginChanges((ids) => {
      dirDirty.value = true
      changedIds.value = ids
    })
    try {
      await bootstrap()
    } finally {
      // bootstrap 装载失败也会落到这里：最多恢复 ready，具体错误已在内部落 console
      ready.value = true
    }
  }

  /** 切换启停（**仅持久化**），持久化写入在 store 落地；点击「重新加载」后立即生效。 */
  function setEnabled(id: string, enabled: boolean): void {
    const next = readEnabled()
    if (enabled) next[id] = true
    else delete next[id]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    manager.value?.setEnabled(id, enabled)
  }

  /**
   * 重新加载插件（不退出应用让插件变更生效）：先 hot-dispose 旧管理器全部插件
   * （onDispose 清理 + 回滚 UI 注册 + 清浮动层残留），再经 bootstrap 重扫重装。
   * 执行期间置 ready=false / reloading=true（UI 渲染装载态并禁用交互）。
   */
  async function reload(): Promise<void> {
    const current = manager.value
    if (reloading.value || !current) return
    reloading.value = true
    ready.value = false
    try {
      // 清理 UI 面板
      const floating = usePluginFloatingStore()
      for (const key of floating.states.keys()) floating.close(key)
      const modalStore = useModalStore()
      if (modalStore.activeKey && modalStore.activeKey !== SETTINGS_MODAL_KEY) {
        modalStore.close()
      }
      // 摘除旧插件的 onDispose 副作用与全部 UI 注册
      current.disposeAll()
      // 重扫重装插件
      await bootstrap()
    } catch (e) {
      console.error('[plugin] 重新加载失败', e)
      // 失败不阻断 UI：保留空 manager，id 集回填为空，仍把 ready 置回 true
      useLayoutStore().setDiscoveredPluginIds([])
      throw e
    } finally {
      // 无论成败都复位脏标记与装载态
      dirDirty.value = false
      changedIds.value = []
      ready.value = true
      reloading.value = false
    }
  }

  return {
    manager,
    records,
    ready,
    reloading,
    dirDirty,
    changedIds,
    init,
    setEnabled,
    reload,
  }
})