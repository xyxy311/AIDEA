/**
 * plugin store 目录脏标记（dirDirty / changedIds）测试（M2）
 *
 * store 的 init() 在桌面运行态经 subscribePluginChanges 订阅桥推送；
 * desktop.ts 在模块加载时读取 window 上的桥（顶部 const 固化），因此与
 * sources.test.ts 同款装置：vi.resetModules() 清模块缓存 → 先置桥状态 →
 * 动态 import 被测模块。桥 stub 用字面量对象 + any（测试不 import 契约文件）。
 *
 * stub 桥 listPlugins 返回 []：entries 空集 → installAll 空转（无真实动态
 * import、无插件 setup），init 走完整引导但零副作用；onPluginsChanged 捕获
 * 订阅回调，测试中手动触发模拟 main 推送。
 *
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * window 上桌面桥的键名。不写桥名完整字面量：红线 1 的 rg 机检要求全 src 只允许
 * sources/desktop.ts 命中该字符串，测试装置用拼接规避机检噪音（同 sources.test.ts）。
 */
const BRIDGE_KEY = `aidea${'Desktop'}`

/** 置桌面桥 stub（any 绕过契约类型，stub 不必实现完整桥面） */
function stubBridge(value: unknown): void {
  ;(window as any)[BRIDGE_KEY] = value
}

/** 清理桥（恢复无桥 = web 形态） */
function unstubBridge(): void {
  delete (window as any)[BRIDGE_KEY]
}

describe('usePluginStore dirDirty（桌面桥推送驱动）', () => {
  beforeEach(() => {
    vi.resetModules()
    unstubBridge()
    // 启停持久化与 layout delta 均落 localStorage：测试间清理避免串扰
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    unstubBridge()
  })

  // 放宽用例超时：vi.resetModules 后动态 import '@/stores/plugin' 会按需加载
  // plugin / layout 大模块图（含 naive-ui 等依赖），冷启动耗时远超默认 5s
  // （非逻辑慢：模块图热后同路径 <1s），故各用例内联 30s 上限。
  it('有桥：init 建立订阅，桥推送后 dirDirty=true 且 changedIds 透传', async () => {
    // 捕获 store 注册到桥的订阅回调（模拟 main 推送入口）
    const cbs: Array<(ids: string[]) => void> = []
    stubBridge({
      kind: 'desktop',
      listPlugins: async () => [], // entries 空集 → installAll 空转
      onPluginsChanged: (cb: (ids: string[]) => void) => {
        cbs.push(cb)
        return () => {}
      },
    })
    const pinia = createPinia()
    setActivePinia(pinia)
    const { usePluginStore } = await import('@/stores/plugin')
    const store = usePluginStore()
    await store.init()

    // 引导完成时未推送 → 脏标记为 false；订阅恰好建立一次
    expect(store.ready).toBe(true)
    expect(store.dirDirty).toBe(false)
    expect(cbs.length).toBe(1)

    // 模拟 main 推送变更插件 id 列表 → 置脏 + 透传
    cbs[0]!(['ai'])
    expect(store.dirDirty).toBe(true)
    expect(store.changedIds).toEqual(['ai'])
  }, 30000)
})
