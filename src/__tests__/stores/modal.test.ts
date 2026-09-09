import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useModalStore } from '@/stores/modal'
import { useViewStore } from '@/stores/view'

describe('useModalStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('初始状态：无模态打开', () => {
    const modal = useModalStore()
    expect(modal.activeKey).toBeNull()
    expect(modal.hasOpenModal).toBe(false)
  })

  it('open 成功置 activeKey，close 复位为 null', () => {
    const modal = useModalStore()
    expect(modal.open('settings')).toBe(true)
    expect(modal.activeKey).toBe('settings')
    expect(modal.hasOpenModal).toBe(true)

    modal.close()
    expect(modal.activeKey).toBeNull()
    expect(modal.hasOpenModal).toBe(false)
  })

  it('单实例策略：已有其他模态打开时 open 拒绝并 warn，activeKey 不变', () => {
    const modal = useModalStore()
    expect(modal.open('settings')).toBe(true)

    expect(modal.open('other')).toBe(false)
    expect(modal.activeKey).toBe('settings')
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('同 key 重复 open 幂等返回 true（不重复收尾）', () => {
    const modal = useModalStore()
    expect(modal.open('settings')).toBe(true)
    expect(modal.open('settings')).toBe(true)
    expect(modal.activeKey).toBe('settings')
  })

  it('编辑态收尾：主视图编辑中 open 先 stopEditing 再打开', () => {
    const view = useViewStore('main')
    view.startEditing('n1')
    expect(view.editingNodeId).toBe('n1')

    const modal = useModalStore()
    expect(modal.open('settings')).toBe(true)

    // 文本编辑已收尾（stopEditing），模态正常打开
    expect(view.editingNodeId).toBeNull()
    expect(modal.activeKey).toBe('settings')
  })

  it('非编辑态 open：editingNodeId 保持 null，不影响打开', () => {
    const view = useViewStore('main')
    const modal = useModalStore()

    expect(modal.open('settings')).toBe(true)
    expect(view.editingNodeId).toBeNull()
  })

  it('close 后可再次 open（含换 key）', () => {
    const modal = useModalStore()
    expect(modal.open('settings')).toBe(true)
    modal.close()

    expect(modal.open('other')).toBe(true)
    expect(modal.activeKey).toBe('other')
  })
})
