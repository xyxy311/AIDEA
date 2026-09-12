import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePluginFloatingStore } from '@/stores/pluginFloating'

/**
 * 插件浮动层运行时状态（stores/pluginFloating.ts）契约测试：
 * - 多实例：states 按完整登记 key（`${pluginId}:${layerId}`）逐条独立显隐；
 * - 默认隐藏：无条目 isVisible=false（纯查询不初始化条目），open 才可见；
 * - open 幂等 true / close 幂等 void / toggle 返回切换后 visible；
 * - 不存位置（拖动偏移是窗口组件本地状态，本 store 无位置字段——类型层面保证）。
 */
describe('pluginFloating store（插件浮动层运行时状态）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('默认隐藏：无条目 isVisible=false（登记 ≠ 可见），open 后可见', () => {
    const s = usePluginFloatingStore()
    expect(s.isVisible('demo:float')).toBe(false)
    expect(s.open('demo:float')).toBe(true)
    expect(s.isVisible('demo:float')).toBe(true)
  })

  it('open 幂等：重复 open 返回 true 且保持可见', () => {
    const s = usePluginFloatingStore()
    expect(s.open('demo:float')).toBe(true)
    expect(s.open('demo:float')).toBe(true)
    expect(s.isVisible('demo:float')).toBe(true)
  })

  it('close 幂等：可见时关掉；未打开 / 无条目再 close 均无副作用', () => {
    const s = usePluginFloatingStore()
    s.open('demo:float')
    s.close('demo:float')
    expect(s.isVisible('demo:float')).toBe(false)

    s.close('demo:float')
    expect(s.isVisible('demo:float')).toBe(false)

    s.close('demo:never-opened') // 无条目 key：close 无副作用（不产生可见条目）
    expect(s.isVisible('demo:never-opened')).toBe(false)
  })

  it('toggle 返回切换后的 visible：false→true→false', () => {
    const s = usePluginFloatingStore()
    expect(s.toggle('demo:float')).toBe(true) // 无条目 → 惰性初始化 false → true
    expect(s.isVisible('demo:float')).toBe(true)
    expect(s.toggle('demo:float')).toBe(false)
    expect(s.isVisible('demo:float')).toBe(false)
  })

  it('多实例：各 key 显隐互不影响（reactive Map 深响应式，逐条独立）', () => {
    const s = usePluginFloatingStore()
    s.open('a:x')
    s.open('b:y')
    s.close('a:x')
    expect(s.isVisible('a:x')).toBe(false)
    expect(s.isVisible('b:y')).toBe(true)
  })

  it('isVisible 纯查询：无条目返回 false 且不初始化条目', () => {
    const s = usePluginFloatingStore()
    expect(s.isVisible('demo:ghost')).toBe(false)
    expect(s.states.has('demo:ghost')).toBe(false) // 未产生条目
  })
})
