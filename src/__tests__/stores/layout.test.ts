import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLayoutStore } from '@/stores/layout'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { PANEL_CATALOG } from '@/constants/panels'
import { DEFAULT_LEFT_TOP, DEFAULT_RIGHT_TOP } from '@/constants/topbar'

/** 内置面板默认分组（与品类表 defaultPlacement 对应） */
const DEFAULT_LEFT = PANEL_CATALOG.filter((p) => p.defaultPlacement === 'left').map((p) => p.id)
const DEFAULT_RIGHT = PANEL_CATALOG.filter((p) => p.defaultPlacement === 'right').map((p) => p.id)

/** 派生目录 → 键数组（测试断言用） */
const keysOf = (entries: { key: string }[]): string[] => entries.map((e) => e.key)

describe('useLayoutStore（delta 模型）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('无 delta：派生目录 = 品类表默认分组，初始激活第一个左侧面板', () => {
    const layout = useLayoutStore()
    expect(keysOf(layout.leftPanels)).toEqual(DEFAULT_LEFT)
    expect(keysOf(layout.rightPanels)).toEqual(DEFAULT_RIGHT)
    expect(layout.activeId).toBe(PANEL_CATALOG[0].id)
    expect(layout.collapsed).toBe(false)
    expect(layout.activeMeta?.key).toBe(PANEL_CATALOG[0].id)
  })

  it('togglePanel：点击激活项 → 收起；再点同项 → 展开', () => {
    const layout = useLayoutStore()
    const firstId = PANEL_CATALOG[0].id
    const secondId = PANEL_CATALOG[1].id

    layout.togglePanel(secondId)
    expect(layout.activeId).toBe(secondId)
    expect(layout.collapsed).toBe(false)

    layout.togglePanel(secondId)
    expect(layout.activeId).toBeNull()
    expect(layout.collapsed).toBe(true)

    layout.togglePanel(firstId)
    expect(layout.activeId).toBe(firstId)
  })

  it('setActive：激活指定面板；不在左侧目录的 id 忽略', () => {
    const layout = useLayoutStore()
    layout.setActive(PANEL_CATALOG[1].id)
    expect(layout.activeId).toBe(PANEL_CATALOG[1].id)

    layout.setActive('nope' as never)
    expect(layout.activeId).toBe(PANEL_CATALOG[1].id)
  })

  it('reorder：写左侧顺序 delta，派生目录随之变化', () => {
    const layout = useLayoutStore()
    const before = keysOf(layout.leftPanels)
    layout.reorder(0, before.length - 1)
    const after = keysOf(layout.leftPanels)
    expect(after[after.length - 1]).toBe(before[0])
    expect(after[0]).toBe(before[1])
  })

  it('collapse / expand：恢复最近激活面板；目标失效则回退第一个', () => {
    const layout = useLayoutStore()
    const secondId = PANEL_CATALOG[1].id
    layout.setActive(secondId)
    layout.collapse()
    expect(layout.collapsed).toBe(true)
    layout.expand()
    expect(layout.activeId).toBe(secondId)

    // lastPanelId 失效（被移除）→ expand 回退第一个左侧面板
    layout.removePanel(secondId)
    layout.expand()
    expect(layout.activeId).toBe(keysOf(layout.leftPanels)[0])
  })

  it('removePanel：进入未放置集合（活动栏「+」来源）；重新加入回到左侧', () => {
    const layout = useLayoutStore()
    const target = 'search'
    layout.removePanel(target)
    expect(keysOf(layout.leftPanels)).not.toContain(target)
    expect(keysOf(layout.unplacedPanels)).toContain(target)

    // 「+」重新加入 → moveToLeft 追加左侧末尾，且移出未放置集合
    layout.moveToLeft(target)
    expect(keysOf(layout.unplacedPanels)).not.toContain(target)
    const left = keysOf(layout.leftPanels)
    expect(left[left.length - 1]).toBe(target)
  })

  it('moveToLeft / moveToRight：跨侧移动写归属覆盖 delta', () => {
    const layout = useLayoutStore()
    layout.moveToLeft('property')
    expect(keysOf(layout.leftPanels)).toContain('property')
    expect(keysOf(layout.rightPanels)).not.toContain('property')

    layout.moveToRight('property')
    expect(keysOf(layout.rightPanels)).toContain('property')
    expect(keysOf(layout.leftPanels)).not.toContain('property')
  })

  it('setRightSize：尺寸覆盖写入，未覆盖面板取默认 1', () => {
    const layout = useLayoutStore()
    const right0 = layout.rightPanels[0].key
    expect(layout.rightSizes[right0] ?? 1).toBe(1)
    layout.setRightSize(right0, 2.5)
    expect(layout.rightSizes[right0]).toBe(2.5)
  })

  it('resetDock：清空 delta 后派生目录回到品类表默认', () => {
    const layout = useLayoutStore()
    layout.moveToLeft('property')
    layout.removePanel('search')
    layout.reorder(0, 2)
    layout.resetDock()
    expect(keysOf(layout.leftPanels)).toEqual(DEFAULT_LEFT)
    expect(keysOf(layout.rightPanels)).toEqual(DEFAULT_RIGHT)
    expect(layout.activeId).toBe(PANEL_CATALOG[0].id)
  })

  it('delta 持久化：重新创建 store 后用户排布保留（旧完整列表数据同样兼容）', () => {
    const layout = useLayoutStore()
    layout.removePanel('search')
    layout.reorder(0, 1)

    // 模拟重启：新 pinia 实例 + 同一 localStorage
    setActivePinia(createPinia())
    const layout2 = useLayoutStore()
    expect(keysOf(layout2.leftPanels)).not.toContain('search')
    expect(keysOf(layout2.unplacedPanels)).toContain('search')
  })

  describe('顶部按钮条（topLeft / topRight）', () => {
    it('无 delta：默认左右顺序来自品类表 defaultZone', () => {
      const layout = useLayoutStore()
      expect(keysOf(layout.topLeft)).toEqual(DEFAULT_LEFT_TOP)
      expect(keysOf(layout.topRight)).toEqual(DEFAULT_RIGHT_TOP)
    })

    it('reorderTop：某侧内换位', () => {
      const layout = useLayoutStore()
      layout.reorderTop('left', 0, layout.topLeft.length - 1)
      const left = keysOf(layout.topLeft)
      expect(left[left.length - 1]).toBe('open')
      expect(left[0]).toBe('save')
    })

    it('moveTopZone：跨侧移动（源侧移除 + 目标侧末尾追加）', () => {
      const layout = useLayoutStore()
      layout.moveTopZone('debug', 'left')
      expect(keysOf(layout.topLeft)).toEqual([...DEFAULT_LEFT_TOP, 'debug'])
      expect(keysOf(layout.topRight)).toEqual(DEFAULT_RIGHT_TOP.filter((id) => id !== 'debug'))
    })

    it('resetTopBar / resetDock：清 delta 复位默认', () => {
      const layout = useLayoutStore()
      layout.reorderTop('left', 0, 1)
      layout.moveTopZone('grid', 'left')
      layout.resetDock()
      expect(keysOf(layout.topLeft)).toEqual(DEFAULT_LEFT_TOP)
      expect(keysOf(layout.topRight)).toEqual(DEFAULT_RIGHT_TOP)
    })
  })

  describe('插件面板（uiRegistry 联动）', () => {
    /** 注册一个假插件面板（icon/component 用占位对象满足类型） */
    function registerDemo(registry: ReturnType<typeof useUiRegistryStore>, id = 'p'): boolean {
      return registry.registerPluginPanel('demo', {
        id,
        title: '演示面板',
        icon: {} as never,
        component: {} as never,
      })
    }

    it('插件注册后自动出现在默认侧末尾（无 ensure 落位）', () => {
      const layout = useLayoutStore()
      expect(registerDemo(useUiRegistryStore())).toBe(true)
      const right = keysOf(layout.rightPanels)
      expect(right[right.length - 1]).toBe('demo:p')
    })

    it('回滚后从派生目录消失；delta 保留 → 重新注册位置恢复', () => {
      const registry = useUiRegistryStore()
      const layout = useLayoutStore()
      registerDemo(registry)
      // 用户把它移到左侧并排到最前
      layout.moveToLeft('demo:p')
      layout.reorder(keysOf(layout.leftPanels).indexOf('demo:p'), 0)
      expect(keysOf(layout.leftPanels)[0]).toBe('demo:p')

      // 回滚（setup 抛错 / 禁用）→ 派生目录收缩
      registry.removePlugin('demo')
      expect(keysOf(layout.leftPanels)).not.toContain('demo:p')

      // 重新注册 → leftOrder delta 仍在，位置恢复
      registerDemo(registry)
      expect(keysOf(layout.leftPanels)[0]).toBe('demo:p')
    })

    it('冲突注册拒绝；非法 id 拒绝', () => {
      const registry = useUiRegistryStore()
      expect(registerDemo(registry)).toBe(true)
      expect(registerDemo(registry)).toBe(false)
      expect(
        registry.registerPluginPanel('demo', { id: 'bad:id', title: 'x', icon: {} as never, component: {} as never }),
      ).toBe(false)
    })
  })
})
