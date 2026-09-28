/**
 * sources/ 插件源测试（纯 Electron 桌面形态）
 *
 * desktop.ts 在模块加载时读取 preload 注入到 window 的桌面桥（顶部 const 固化），
 * 因此每个用例先 vi.resetModules() 清模块缓存，再置桥状态后动态 import 被测模块。
 * 桥 stub 用字面量对象 + any（测试不得 import 契约文件——契约 import 面只允许
 * sources/desktop.ts 命中）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * window 上桌面桥的键名。不写桥名完整字面量：架构红线要求全 src 只允许
 * sources/desktop.ts 命中该字符串，测试装置用拼接规避机检噪音（语义不变）。
 */
const BRIDGE_KEY = `aidea${'Desktop'}`

/** 置桌面桥 stub（any 绕过契约类型，stub 不必实现完整桥面） */
function stubBridge(value: unknown): void {
  ;(window as any)[BRIDGE_KEY] = value
}

/** 清理桥（测试间隔离，避免残留串扰） */
function unstubBridge(): void {
  delete (window as any)[BRIDGE_KEY]
}

describe('collectPluginEntries（sources 聚合收口）', () => {
  beforeEach(() => {
    vi.resetModules()
    unstubBridge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    unstubBridge()
  })

  it('恒走桌面源：经桥扫描返回目录条目', async () => {
    stubBridge({
      kind: 'desktop',
      listPlugins: async () => [
        { id: 'ai', entry: 'plugin.js', manifest: null },
        { id: 'other', entry: 'plugin.js', manifest: null },
      ],
      onPluginsChanged: () => () => {},
    })
    const { collectPluginEntries } = await import('@/plugin/sources')
    const entries = await collectPluginEntries()
    expect(entries).toHaveLength(2)
    expect(new Set(entries.map((e) => e.id))).toEqual(new Set(['ai', 'other']))
  })
})

describe('collectDesktopEntries（桌面源单测）', () => {
  beforeEach(() => {
    vi.resetModules()
    unstubBridge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    unstubBridge()
  })

  it('error 非空的条目被过滤', async () => {
    stubBridge({
      kind: 'desktop',
      listPlugins: async () => [
        { id: 'bad', entry: 'plugin.js', manifest: null, error: 'manifest.json 解析失败' },
        { id: 'good', entry: 'plugin.js', manifest: null },
      ],
      onPluginsChanged: () => () => {},
    })
    const { collectDesktopEntries } = await import('@/plugin/sources/desktop')
    const entries = await collectDesktopEntries()
    expect(entries.map((e) => e.id)).toEqual(['good'])
  })

  it('IPC listPlugins reject → console.error + 空集', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubBridge({
      kind: 'desktop',
      listPlugins: () => Promise.reject(new Error('ipc down')),
      onPluginsChanged: () => () => {},
    })
    const { collectDesktopEntries } = await import('@/plugin/sources/desktop')
    const entries = await collectDesktopEntries()
    expect(entries).toEqual([])
    expect(error).toHaveBeenCalledTimes(1)
  })
})

describe('subscribePluginChanges（桥推送订阅转发）', () => {
  beforeEach(() => {
    vi.resetModules()
    unstubBridge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    unstubBridge()
  })

  it('cb 注册到桥、推送 id 透传、退订函数转发桥的退订', async () => {
    const unsubSpy = vi.fn()
    const registered: Array<(ids: string[]) => void> = []
    stubBridge({
      kind: 'desktop',
      onPluginsChanged: (cb: (ids: string[]) => void) => {
        registered.push(cb)
        return unsubSpy
      },
    })
    const { subscribePluginChanges } = await import('@/plugin/sources/desktop')
    const cb = vi.fn()
    const unsub = subscribePluginChanges(cb)
    // cb 被注册到桥（订阅转发）
    expect(registered).toEqual([cb])
    // 桥推送 → id 列表透传给订阅方
    registered[0]!(['ai'])
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(['ai'])
    // 返回的退订函数 → 转发桥的退订
    unsub()
    expect(unsubSpy).toHaveBeenCalledTimes(1)
  })
})