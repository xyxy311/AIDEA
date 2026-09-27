/**
 * plugin store reload 流程测试
 *
 * reload = 热清理旧插件（disposeAll）+ 重扫目录收集 + 重建 manager 重装。
 * 桥 stub 遵循 store-dirty.test.ts 同款装置：vi.resetModules() → 先置桥 →
 * 动态 import（desktop.ts 模块加载时读取 window 桥 const，需清模块缓存）。
 * listPlugins 返回空集：installAll/重装空转（无真实动态 import），用例聚焦
 * 状态流转与脏标记复位，不触碰真实装载语义。
 *
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const BRIDGE_KEY = `aidea${'Desktop'}`

function stubBridge(value: unknown): void {
  ;(window as any)[BRIDGE_KEY] = value
}

function unstubBridge(): void {
  delete (window as any)[BRIDGE_KEY]
}

describe('usePluginStore reload（重扫重装）', () => {
  beforeEach(() => {
    vi.resetModules()
    unstubBridge()
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    unstubBridge()
  })

  it('reload 重装后 ready 复位、脏标记与变更列表被清空、记录重新装载', async () => {
    const cbs: Array<(ids: string[]) => void> = []
    stubBridge({
      kind: 'desktop',
      listPlugins: async () => [], // 重扫返回空集 → 重装空转
      onPluginsChanged: (cb: (ids: string[]) => void) => {
        cbs.push(cb)
        return () => {}
      },
    })
    setActivePinia(createPinia())
    const { usePluginStore } = await import('@/stores/plugin')
    const store = usePluginStore()
    await store.init()
    expect(store.ready).toBe(true)
    const before = store.manager

    // 先置脏，再触发 reload → 脏标记 / changedIds / 装载态复位到干净状态
    cbs[0]!(['ai'])
    expect(store.dirDirty).toBe(true)
    expect(store.changedIds).toEqual(['ai'])

    await store.reload()

    expect(store.ready).toBe(true)
    expect(store.reloading).toBe(false)
    expect(store.dirDirty).toBe(false)
    expect(store.changedIds).toEqual([])
    // reload 经 bootstrap 重扫并新建 manager（覆用装载主体，非复用旧实例）
    expect(store.manager).not.toBe(before)
    expect(store.manager).not.toBeNull()
  }, 30000)

  it('reload 进行中再次调用被幂等拒绝（reloading 守卫）', async () => {
    const cbs: Array<(ids: string[]) => void> = []
    stubBridge({
      kind: 'desktop',
      listPlugins: async () => [],
      onPluginsChanged: (cb: (ids: string[]) => void) => {
        cbs.push(cb)
        return () => {}
      },
    })
    setActivePinia(createPinia())
    const { usePluginStore } = await import('@/stores/plugin')
    const store = usePluginStore()
    await store.init()

    // 促使 reload 保持“进行中”：第一次 reload 尚未完成时同步夺命再调用
    const p1 = store.reload()
    const p2 = store.reload() // reloading=true → 直接 return（幂等）
    await Promise.all([p1, p2])

    expect(store.reloading).toBe(false)
    expect(store.ready).toBe(true)
  }, 30000)
})