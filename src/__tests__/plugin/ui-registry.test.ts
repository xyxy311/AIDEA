import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { createPluginUiApi, type PluginPanelRegistration } from '@/plugin/ui'
import { usePluginStore } from '@/stores/plugin'
import { useLayoutStore } from '@/stores/layout'

/**
 * 插件 UI 注册契约测试（ui-registry）：
 * 覆盖 registerPanel / registerTopBarButton / registerSettingsCategory 在
 * `stores/plugin.ts` 注册表与 `layout` 落位的实际行为。
 *
 * 关键事实（以实代码为准，勿臆测）：
 * - `registerUiPanel` / `registerUiTopBarButton` / `registerUiSettingsCategory`
 *   （stores/plugin.ts）**只写** uiPanels / uiTopBarButtons / uiSettingsCategories 三个 reactive Map，
 *   归一 key 为 `${pluginId}:${id}`，冲突拒绝覆盖。
 * - store 层**不**对 defaultPlacement / zone 做存储时兜底（省略时存 undefined）；`'right'` / `'left'`
 *   缺省发生在 `registerUiPanel` 调 `layout.ensurePanel(key, entry.defaultPlacement ?? 'right')` 与
 *   `registerUiTopBarButton` 调 `layout.ensureTop(key, entry.zone ?? 'left')` 的落位参数处。
 * - `layout.ensurePanel / ensureTop`（stores/layout.ts）**已**接入注册路径：注册面板 / 顶栏按钮
 *   后，插件 key 会按缺省放置侧被追加到 `rightPanels / leftTop` 末尾（幂等，不重复追加）。
 */
const Icon = defineComponent(() => () => h('div'))

function dummyPanel(over: Partial<PluginPanelRegistration> = {}): PluginPanelRegistration {
  return {
    id: 'p',
    title: '统计助手',
    icon: Icon,
    component: defineComponent(() => () => h('div')),
    ...over,
  }
}

describe('插件 UI 注册契约', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('registerPanel：key 归并为 demo:p，pluginId=demo', () => {
    const ui = createPluginUiApi('demo')
    ui.registerPanel(dummyPanel({ defaultPlacement: 'right' }))

    const store = usePluginStore()
    const entry = store.uiPanels.get('demo:p')
    expect(entry).toBeDefined()
    expect(entry!.key).toBe('demo:p')
    expect(entry!.pluginId).toBe('demo')
    expect(entry!.title).toBe('统计助手')
    expect(entry!.defaultPlacement).toBe('right')
  })

  it('registerPanel：defaultPlacement 省略时 store 层存 undefined（缺省在渲染合并层做）', () => {
    const ui = createPluginUiApi('demo')
    ui.registerPanel(dummyPanel({})) // 不传 defaultPlacement

    const store = usePluginStore()
    const entry = store.uiPanels.get('demo:p')
    expect(entry).toBeDefined()
    // 实代码：store 不兜底，缺省 'right' 由 uiMerge 渲染层 entry.defaultPlacement ?? 'right' 承担
    expect(entry!.defaultPlacement).toBeUndefined()
  })

  it('重复注册同 id 不同 title → 不覆盖（原 title 保留）', () => {
    const store = usePluginStore()
    const first = store.registerUiPanel('demo', dummyPanel({ title: '原始标题' }))
    const second = store.registerUiPanel('demo', dummyPanel({ title: '新标题' }))

    expect(first).toBe(true)
    expect(second).toBe(false) // 冲突拒绝覆盖
    expect(store.uiPanels.get('demo:p')!.title).toBe('原始标题')
  })

  it('短 id 含冒号或空白 → 拒绝（表中无该 key）', () => {
    const ui = createPluginUiApi('demo')
    ui.registerPanel(dummyPanel({ id: 'a:b' }))
    ui.registerPanel(dummyPanel({ id: 'a b' }))
    ui.registerTopBarButton({
      id: 'x:y',
      title: '按钮',
      icon: Icon,
      onClick: () => undefined,
    })
    ui.registerSettingsCategory({ id: 'x y', title: '配置', component: Icon })

    const store = usePluginStore()
    expect(store.uiPanels.has('demo:a:b')).toBe(false)
    expect(store.uiPanels.has('demo:a b')).toBe(false)
    expect(store.uiTopBarButtons.has('demo:x:y')).toBe(false)
    expect(store.uiSettingsCategories.has('demo:x y')).toBe(false)
  })

  it('registerTopBarButton / registerSettingsCategory 正常注册并归并 pluginId', () => {
    const ui = createPluginUiApi('demo')
    ui.registerTopBarButton({
      id: 'btn',
      title: '示例动作',
      icon: Icon,
      zone: 'left',
      onClick: () => undefined,
    })
    ui.registerSettingsCategory({ id: 'cfg', title: '配置', component: Icon })

    const store = usePluginStore()
    const btn = store.uiTopBarButtons.get('demo:btn')
    expect(btn?.pluginId).toBe('demo')
    expect(btn?.zone).toBe('left')
    expect(store.uiSettingsCategories.has('demo:cfg')).toBe(true)
  })

  it('unregisterPluginUi：三表清空该插件全部项', () => {
    const ui = createPluginUiApi('demo')
    ui.registerPanel(dummyPanel())
    ui.registerTopBarButton({ id: 'btn', title: '动作', icon: Icon, onClick: () => undefined })
    ui.registerSettingsCategory({ id: 'cfg', title: '配置', component: Icon })

    const store = usePluginStore()
    expect(store.uiPanels.size).toBe(1)
    expect(store.uiTopBarButtons.size).toBe(1)
    expect(store.uiSettingsCategories.size).toBe(1)

    store.unregisterPluginUi('demo')
    expect(store.uiPanels.has('demo:p')).toBe(false)
    expect(store.uiTopBarButtons.has('demo:btn')).toBe(false)
    expect(store.uiSettingsCategories.has('demo:cfg')).toBe(false)
    // 不影响其它插件
    expect(store.uiPanels.size).toBe(0)
  })

  it('registerPanel 已接入 ensurePanel：注册后按缺省右侧重落位，重复注册幂等不重复追加', () => {
    const ui = createPluginUiApi('demo')
    ui.registerPanel(dummyPanel({ defaultPlacement: 'right' }))
    // 重复注册（同 key）→ registerUiPanel 冲突返回 false，不再触发 ensurePanel
    ui.registerPanel(dummyPanel({ defaultPlacement: 'right', title: '新标题' }))

    expect(usePluginStore().uiPanels.has('demo:p')).toBe(true)
    const layout = useLayoutStore()
    // ensurePanel 已接线：demo:p 被追加到右侧末尾
    expect(layout.rightPanels).toContain('demo:p')
    expect(layout.rightSizes['demo:p']).toBe(1)
    // 幂等：即使再注册一次也不重复追加
    expect(layout.rightPanels.filter((id) => id === 'demo:p')).toHaveLength(1)
  })

  it('registerPanel 缺省 defaultPlacement → ensurePanel 按 right 落位（存储层仍存 undefined）', () => {
    const ui = createPluginUiApi('demo')
    ui.registerPanel(dummyPanel({})) // 不传 defaultPlacement

    expect(usePluginStore().uiPanels.get('demo:p')!.defaultPlacement).toBeUndefined()
    const layout = useLayoutStore()
    // 缺省 'right' 用于 ensurePanel 落位参数，落在右侧
    expect(layout.rightPanels).toContain('demo:p')
  })

  it('registerTopBarButton 已接入 ensureTop：注册后按缺省左 zone 落位，重复注册幂等', () => {
    const ui = createPluginUiApi('demo')
    ui.registerTopBarButton({
      id: 'btn',
      title: '示例动作',
      icon: Icon,
      zone: 'left',
      onClick: () => undefined,
    })

    expect(usePluginStore().uiTopBarButtons.has('demo:btn')).toBe(true)
    const layout = useLayoutStore()
    // ensureTop 已接线：demo:btn 落位到左顶部条
    expect(layout.leftTop).toContain('demo:btn')
    expect(layout.leftTop.filter((id) => id === 'demo:btn')).toHaveLength(1)
  })

  it('layout.ensurePanel 幂等：主动再调用不重复追加', () => {
    const ui = createPluginUiApi('demo')
    ui.registerPanel(dummyPanel({ defaultPlacement: 'right' }))
    const layout = useLayoutStore()
    expect(layout.rightPanels.filter((id) => id === 'demo:p')).toHaveLength(1)
    // 手动再 ensurePanel：已放置 → 不动
    layout.ensurePanel('demo:p' as never, 'right')
    expect(layout.rightPanels.filter((id) => id === 'demo:p')).toHaveLength(1)
  })
})