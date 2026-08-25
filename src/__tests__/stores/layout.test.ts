import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLayoutStore } from '@/stores/layout'
import { PANEL_CATALOG } from '@/constants/panels'
import { DEFAULT_LEFT_TOP, DEFAULT_RIGHT_TOP } from '@/constants/topbar'

describe('useLayoutStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('初始激活第一个注册面板，且默认展开', () => {
    const layout = useLayoutStore()
    expect(layout.activeId).toBe(PANEL_CATALOG[0].id)
    expect(layout.collapsed).toBe(false)
    expect(layout.activeMeta?.id).toBe(PANEL_CATALOG[0].id)
  })

  it('togglePanel：点击激活项 → 收起；再点同项 → 展开', () => {
    const layout = useLayoutStore()
    const firstId = PANEL_CATALOG[0].id
    const secondId = PANEL_CATALOG[1].id

    // 切到第二个面板（展开）
    layout.togglePanel(secondId)
    expect(layout.activeId).toBe(secondId)
    expect(layout.collapsed).toBe(false)

    // 再点同项 → 收起
    layout.togglePanel(secondId)
    expect(layout.activeId).toBeNull()
    expect(layout.collapsed).toBe(true)

    // 点不同项 → 重新展开
    layout.togglePanel(firstId)
    expect(layout.activeId).toBe(firstId)
    expect(layout.collapsed).toBe(false)
  })

  it('setActive：激活指定面板；无效 id 忽略', () => {
    const layout = useLayoutStore()
    layout.setActive(PANEL_CATALOG[1].id)
    expect(layout.activeId).toBe(PANEL_CATALOG[1].id)

    // 无效 id 不改变状态
    layout.setActive('nope' as never)
    expect(layout.activeId).toBe(PANEL_CATALOG[1].id)
  })

  it('reorder：调整活动栏顺序', () => {
    const layout = useLayoutStore()
    const original = [...layout.panels]
    // 把第一个面板移到末尾
    layout.reorder(0, original.length - 1)
    expect(layout.panels[original.length - 1]).toBe(original[0])
    expect(layout.panels[0]).toBe(original[1])
  })

  it('reorder：from === to 时无变化', () => {
    const layout = useLayoutStore()
    const before = [...layout.panels]
    layout.reorder(1, 1)
    expect(layout.panels).toEqual(before)
  })

  it('reorder 后激活面板仍归属 panels（activeId 不变）', () => {
    const layout = useLayoutStore()
    layout.reorder(0, 1)
    layout.setActive(PANEL_CATALOG[0].id)
    expect(layout.activeId).toBe(PANEL_CATALOG[0].id)
    expect(layout.panels.includes(layout.activeId!)).toBe(true)
  })

  it('collapse：直接收起面板区', () => {
    const layout = useLayoutStore()
    layout.collapse()
    expect(layout.activeId).toBeNull()
    expect(layout.collapsed).toBe(true)
  })

  it('collapse 后 expand 恢复最近激活的面板', () => {
    const layout = useLayoutStore()
    const secondId = PANEL_CATALOG[1].id
    layout.setActive(secondId)
    layout.collapse()
    expect(layout.collapsed).toBe(true)
    layout.expand()
    expect(layout.activeId).toBe(secondId)
    expect(layout.collapsed).toBe(false)
  })

  it('togglePanel 收起后 expand 恢复同一面板', () => {
    const layout = useLayoutStore()
    const secondId = PANEL_CATALOG[1].id
    layout.togglePanel(secondId)
    layout.togglePanel(secondId) // 收起
    expect(layout.collapsed).toBe(true)
    layout.expand()
    expect(layout.activeId).toBe(secondId)
  })

  describe('顶部按钮条（leftTop / rightTop）', () => {
    it('默认左右顺序来自品类表 defaultZone', () => {
      const layout = useLayoutStore()
      expect(layout.leftTop).toEqual(DEFAULT_LEFT_TOP)
      expect(layout.rightTop).toEqual(DEFAULT_RIGHT_TOP)
    })

    it('reorderTop：某侧内换位', () => {
      const layout = useLayoutStore()
      layout.reorderTop('left', 0, layout.leftTop.length - 1)
      expect(layout.leftTop[layout.leftTop.length - 1]).toBe('open')
      expect(layout.leftTop[0]).toBe('save')
    })

    it('moveTopZone：跨侧移动（源侧移除 + 目标侧末尾追加）', () => {
      const layout = useLayoutStore()
      layout.moveTopZone('debug', 'left')
      expect(layout.leftTop).toEqual([...DEFAULT_LEFT_TOP, 'debug'])
      expect(layout.rightTop).toEqual(DEFAULT_RIGHT_TOP.filter((id) => id !== 'debug'))
    })

    it('resetTopBar：清除持久化并复位默认', () => {
      const layout = useLayoutStore()
      layout.reorderTop('left', 0, 1)
      layout.resetTopBar()
      expect(layout.leftTop).toEqual(DEFAULT_LEFT_TOP)
      expect(layout.rightTop).toEqual(DEFAULT_RIGHT_TOP)
    })

    it('resetDock 同时复位顶部按钮条', () => {
      const layout = useLayoutStore()
      layout.moveTopZone('grid', 'left')
      layout.resetDock()
      expect(layout.leftTop).toEqual(DEFAULT_LEFT_TOP)
      expect(layout.rightTop).toEqual(DEFAULT_RIGHT_TOP)
    })
  })
})