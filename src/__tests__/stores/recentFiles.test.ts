/**
 * recentFiles store - 最近打开项目（路径式）测试
 *
 * 纯桌面形态：最近列表只存 name + path（磁盘由 main 进程经 aideaFile 桥管理），
 * 不再内联项目内容。验证：同名去重置顶、按最近时间降序、超量裁剪、remove/clear。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRecentFilesStore } from '@/stores/recentFiles'

describe('useRecentFilesStore（路径式最近文件）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('add 记录 name+path，按最近打开时间降序（最新在前）', () => {
    const store = useRecentFilesStore()
    // Date.now 在单测内逐次调用会递增，但为确定性排序，手动构造时间差异不可行（内部用 Date.now）
    // ——故只验证首条在列表头、末条在列尾的相对顺序由 lastOpenedAt 递增保证基本成立。
    store.add('b.aidea.json', 'C:/p/b')
    store.add('a.aidea.json', 'C:/p/a')
    expect(store.list).toHaveLength(2)
    // 后插入的 a 因 lastOpenedAt 更大应排在最前
    expect(store.list[0]!.name).toBe('a.aidea.json')
    expect(store.list[0]!.path).toBe('C:/p/a')
    expect(store.list[1]!.name).toBe('b.aidea.json')
  })

  it('同名去重：重新 add 同名项 → 置顶且仅保留一条', () => {
    const store = useRecentFilesStore()
    store.add('x.aidea.json', 'C:/p/1')
    store.add('y.aidea.json', 'C:/p/2')
    store.add('x.aidea.json', 'C:/p/1-new') // 重开 x，路径更新
    expect(store.list).toHaveLength(2)
    expect(store.list[0]!.name).toBe('x.aidea.json')
    expect(store.list[0]!.path).toBe('C:/p/1-new')
  })

  it('超量裁剪：最多保留 MAX_RECENT=8 条，超出丢弃最旧', () => {
    const store = useRecentFilesStore()
    for (let i = 0; i < 10; i++) store.add(`f${i}.aidea.json`, `C:/p/f${i}`)
    expect(store.list).toHaveLength(8)
    // 最旧的 f0、f1 被裁剪掉，头部是最新 f9
    expect(store.list[0]!.name).toBe('f9.aidea.json')
    expect(store.list.some((f) => f.name === 'f0.aidea.json')).toBe(false)
  })

  it('add 忽略空 name 或空 path', () => {
    const store = useRecentFilesStore()
    store.add('', 'C:/p/x')
    store.add('y.aidea.json', '')
    expect(store.list).toHaveLength(0)
  })

  it('remove 按 id 移除；clear 清空', () => {
    const store = useRecentFilesStore()
    store.add('a.aidea.json', 'C:/p/a')
    store.add('b.aidea.json', 'C:/p/b')
    const [a, b] = store.list
    expect(store.list).toHaveLength(2)
    store.remove(a.id)
    expect(store.list).toHaveLength(1)
    expect(store.list[0]!.id).toBe(b.id)
    store.clear()
    expect(store.list).toHaveLength(0)
  })

  it('不内联项目内容（纯桌面形态：路径式，磁盘归 main）', () => {
    const store = useRecentFilesStore()
    store.add('a.aidea.json', 'C:/p/a')
    // 条目不携带 content 字段；打开时经桥（FILE_READ）重新读盘
    const rec = store.list[0]!
    expect((rec as unknown as Record<string, unknown>).content).toBeUndefined()
    expect(rec.path).toBe('C:/p/a')
  })
})