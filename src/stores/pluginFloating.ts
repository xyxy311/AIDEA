import { reactive } from 'vue'
import { defineStore } from 'pinia'

/**
 * 插件浮动层运行时状态（多实例，逐 key 独立显隐；与单实例的 modal store 对称）。
 * 只存「可见与否」，不管位置（拖动偏移归窗口壳组件本地状态）。默认隐藏，isVisible 纯查询不初始化条目。
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
