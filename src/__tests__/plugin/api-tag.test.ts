import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createTagApi } from '@/plugin/api/tag'

/**
 * 标签域分类 api 测试（createTagApi 直测）。
 * 只读方法如实反映 store；CRUD 为项目级操作，不可撤销（不经命令层），
 * 与 tags store 语义保持一致。
 */
function makeApi() {
  return createTagApi()
}

describe('createTagApi 标签域', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('add 新建标签并出现在 list/get 中', () => {
    const api = makeApi()
    const tag = api.add('重要')
    expect(tag.id).toBeTruthy()
    expect(tag.name).toBe('重要')
    expect(tag.color).toBe('#4fc3f7') // 默认色
    expect(api.list()).toEqual([
      expect.objectContaining({ id: tag.id, name: '重要', color: '#4fc3f7' }),
    ])
    expect(api.get(tag.id)).toEqual(tag)
  })

  it('add 支持自定义颜色', () => {
    const api = makeApi()
    const tag = api.add('紧急', '#ff0000')
    expect(api.get(tag.id)?.color).toBe('#ff0000')
  })

  it('rename 重命名标签', () => {
    const api = makeApi()
    const tag = api.add('旧名')
    api.rename(tag.id, '新名')
    expect(api.get(tag.id)?.name).toBe('新名')
  })

  it('rename 对不存在的 id 静默无操作', () => {
    const api = makeApi()
    api.add('a')
    expect(() => api.rename('no-such-id', 'x')).not.toThrow()
    expect(api.list()).toHaveLength(1)
  })

  it('updateColor 修改标签颜色', () => {
    const api = makeApi()
    const tag = api.add('a')
    api.updateColor(tag.id, '#3ad6a0')
    expect(api.get(tag.id)?.color).toBe('#3ad6a0')
  })

  it('remove 删除标签并从 list 移除', () => {
    const api = makeApi()
    const a = api.add('a')
    const b = api.add('b')
    api.remove(a.id)
    expect(api.get(a.id)).toBeUndefined()
    expect(api.list().map((t) => t.id)).toEqual([b.id])
  })

  it('remove 对不存在的 id 静默无操作', () => {
    const api = makeApi()
    api.add('a')
    expect(() => api.remove('no-such-id')).not.toThrow()
    expect(api.list()).toHaveLength(1)
  })

  it('reorder 调整标签顺序', () => {
    const api = makeApi()
    const a = api.add('a')
    const b = api.add('b')
    const c = api.add('c')
    // 将索引 2 移到索引 0：c, a, b
    api.reorder(2, 0)
    expect(api.list().map((t) => t.id)).toEqual([c.id, a.id, b.id])
  })

  it('reorder 越界索引静默无操作', () => {
    const api = makeApi()
    const a = api.add('a')
    const b = api.add('b')
    api.reorder(0, 99)
    expect(api.list().map((t) => t.id)).toEqual([a.id, b.id])
  })

  it('clear 清空全部标签定义', () => {
    const api = makeApi()
    api.add('a')
    api.add('b')
    api.clear()
    expect(api.list()).toEqual([])
  })

  it('list 返回普通数组副本（有序），修改返回结果不影响 store', () => {
    const api = makeApi()
    const a = api.add('b')
    const b = api.add('a')
    const snapshot = api.list()
    expect(Array.isArray(snapshot)).toBe(true)
    expect(snapshot.map((t) => t.id)).toEqual([a.id, b.id]) // 有序
    snapshot.push({ id: 'fake', name: 'x', color: '#000' }) // 往副本追加，不应影响 store
    expect(api.list()).toHaveLength(2)
  })
})