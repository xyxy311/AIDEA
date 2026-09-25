import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useViewStore } from '@/stores/view'

/**
 * 模态面板运行时状态（单实例，无栈）：记录当前打开的模态 key，供键鼠守卫与模态组件消费。
 * 同一时刻至多一个模态，open 冲突时 console.warn 并拒绝。
 */

/** 内置保留 key：设置面板（SettingsModal）。不经 uiRegistry.modals 登记，由宿主 PluginModalHost 直接承载。 */
export const SETTINGS_MODAL_KEY = 'settings'

export const useModalStore = defineStore('modal', () => {
  /** 当前打开的模态 key（null = 无模态打开） */
  const activeKey = ref<string | null>(null)

  /** 是否有模态打开（键鼠守卫统一读取） */
  const hasOpenModal = computed(() => activeKey.value !== null)

  /**
   * 打开模态
   *
   * - 同 key 重复 open → 幂等 return true
   * - 已有其他模态打开 → console.warn + return false（单实例策略，不做栈）
   * - 成功路径：先做编辑态收尾——主视图文本编辑中则 stopEditing()（文本正常提交，
   *   防止模态浮层与节点内联文本编辑器并存），再置 activeKey。
   *
   * @returns 是否成功打开
   */
  function open(key: string): boolean {
    if (activeKey.value === key) return true
    if (activeKey.value !== null) {
      console.warn(`[modal] 已有模态打开（${activeKey.value}），拒绝打开「${key}」`)
      return false
    }
    // 编辑态收尾：useViewStore 为 pinia defineStore 工厂（同 viewId 幂等缓存），
    // 此处与 AppShell 拿到的是同一主视图实例；若主视图尚未初始化则惰性创建
    // （editingNodeId 初始为 null，收尾判断无副作用），所有打开路径均经此处收尾
    const mainView = useViewStore('main')
    if (mainView.editingNodeId !== null) {
      mainView.stopEditing()
    }
    activeKey.value = key
    return true
  }

  /** 关闭当前模态（无模态打开时幂等） */
  function close(): void {
    activeKey.value = null
  }

  return { activeKey, hasOpenModal, open, close }
})
