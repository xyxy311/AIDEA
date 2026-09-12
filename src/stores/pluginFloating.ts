import { reactive } from 'vue'
import { defineStore } from 'pinia'

/**
 * 插件浮动层运行时状态（多实例，逐 key 独立显隐）
 *
 * 与模态运行时（stores/modal.ts）对称的运行时面，但形态不同：
 * - 模态单实例（activeKey，open 冲突拒绝）；浮动层多实例——states 按**完整登记 key**
 *   （`${pluginId}:${layerId}`）逐条记录 `{ visible }`，各条目显隐互不影响。
 * - 只管「可见与否」，不管位置：拖动偏移是窗口壳组件（common/FloatingWindow）的本地
 *   ref 状态，关闭重开即回视口中心（v-if 卸载重挂即重置），与原 FloatingAIWordPanel
 *   行为一致。
 * - 条目默认隐藏（登记 ≠ 可见）：条目读写时惰性初始化（visible=false），open 才可见；
 *   isVisible 对无条目 key 恒返回 false（不初始化条目，纯查询）。
 *
 * 调用方：插件经运行时面 createPluginFloatingApi（plugin/ui.ts，open/toggle 前 fail-fast
 * 查 uiRegistry 登记表，store 本身不校验）转发到本 store；宿主 PluginFloatingHost 按
 * isVisible(key) 映射为 FloatingWindow 壳（components/common）的 show prop 决定渲染。
 * 本 store 与 modal store 同层：只存状态，不做登记表校验。
 */

/** 单个浮动层的运行时状态（最小面：目前只有显隐） */
interface FloatingLayerState {
  visible: boolean
}

export const usePluginFloatingStore = defineStore('pluginFloating', () => {
  /** 显隐状态表：key = 完整登记 key `${pluginId}:${layerId}`（reactive Map 深响应式） */
  const states = reactive(new Map<string, FloatingLayerState>())

  /** 惰性初始化条目（写路径前调用；visible 默认 false，登记 ≠ 可见） */
  function ensure(key: string): FloatingLayerState {
    let s = states.get(key)
    if (!s) {
      s = { visible: false }
      states.set(key, s)
    }
    return s
  }

  /**
   * 打开浮动层
   * - 无条目 → 惰性初始化（visible=false）后置 true
   * - 已打开 → 幂等 return true（无多实例冲突问题，各 key 独立）
   */
  function open(key: string): boolean {
    ensure(key).visible = true
    return true
  }

  /** 关闭浮动层（幂等：未打开 / 无条目均无副作用） */
  function close(key: string): void {
    ensure(key).visible = false
  }

  /** 切换显隐，返回切换后的 visible */
  function toggle(key: string): boolean {
    const s = ensure(key)
    s.visible = !s.visible
    return s.visible
  }

  /** 是否可见（纯查询：无条目 = false，不初始化条目） */
  function isVisible(key: string): boolean {
    return states.get(key)?.visible ?? false
  }

  return { states, open, close, toggle, isVisible }
})
