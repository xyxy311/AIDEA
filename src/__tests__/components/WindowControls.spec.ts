/**
 * WindowControls — 窗口控制按钮组的真实挂载测试：
 * 验证最小化 / 最大化 / 关闭行为、未保存确认及最大化图标随主进程状态切换。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { SquareOutline, CopyOutline } from '@vicons/ionicons5'

/** 假桥的形状（与 useWindowControls 内 AideaWindowBridge 一致，仅测试用） */
interface FakeBridge {
  minimize: ReturnType<typeof vi.fn>
  toggleMaximize: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  isMaximized: ReturnType<typeof vi.fn>
  onMaximizedChange: ReturnType<typeof vi.fn>
}

/** fake projectFile 的形状（组件只消费 confirmDiscard，即统一未保存确认） */
interface FakeProjectFile {
  confirmDiscard: ReturnType<typeof vi.fn>
}

/** 已挂载实例收集：afterEach 统一 unmount（触发卸载取消订阅，防止跨用例残留） */
const wrappers: VueWrapper<any, any>[] = []

/** 构造假桥：动作全部 vi.fn；捕获 onMaximizedChange 回调供用例手动触发事件 */
function createFakeBridge() {
  let maximized = false
  let changeCb: ((max: boolean) => void) | null = null
  let unsubscribed = false
  const bridge: FakeBridge = {
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn(async () => maximized),
    onMaximizedChange: vi.fn((cb: (max: boolean) => void) => {
      changeCb = cb
      return () => {
        changeCb = null
        unsubscribed = true
      }
    }),
  }
  return {
    bridge,
    /** 用例手动模拟主进程侧最大化状态变更（经订阅回调推送） */
    emitMaximized(max: boolean) {
      maximized = max
      changeCb?.(max)
    },
    /** 设置 isMaximized() 初值查询的返回结果 */
    setMaximized(max: boolean) {
      maximized = max
    },
    /** 订阅是否已被取消 */
    get unsubscribed() {
      return unsubscribed
    },
  }
}

/** 构造 fake projectFile：confirmDiscard 可控返回（模拟干净项目 / 脏项目取消） */
function createFakeProjectFile(discard: boolean): FakeProjectFile {
  return { confirmDiscard: vi.fn(async () => discard) }
}

/**
 * 按当前 window.aideaWindow 状态挂载组件（先重置模块表，让桥在模块加载时被重新读取）。
 * @param fake          假桥（纯桌面形态必须提供）
 * @param projectFile   经 global.provide 注入的 fake projectFile；缺省 = 无注入（兜底路径）
 */
async function mountControls(
  fake: ReturnType<typeof createFakeBridge>,
  projectFile?: FakeProjectFile,
) {
  ;(window as any).aideaWindow = fake.bridge
  vi.resetModules()
  const mod = await import('@/components/topbar/WindowControls.vue')
  const wrapper = mount(mod.default, {
    global: projectFile ? { provide: { projectFile } } : undefined,
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('WindowControls（窗口控制按钮组）', () => {
  beforeEach(() => {
    delete (window as any).aideaWindow
  })

  afterEach(() => {
    for (const w of wrappers.splice(0)) w.unmount()
    delete (window as any).aideaWindow
  })

  it('有桥时渲染三个按钮：点击最小化/最大化直接调桥（不经未保存确认）', async () => {
    const fake = createFakeBridge()
    const projectFile = createFakeProjectFile(true)
    const wrapper = await mountControls(fake, projectFile)

    const buttons = wrapper.findAll('.win-btn')
    expect(buttons.length).toBe(3)
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await flushPromises()

    expect(fake.bridge.minimize).toHaveBeenCalledTimes(1)
    expect(fake.bridge.toggleMaximize).toHaveBeenCalledTimes(1)
    // 最小化 / 最大化切换是视图操作，不经统一未保存确认
    expect(projectFile.confirmDiscard).not.toHaveBeenCalled()
  })

  it('关闭：确认放弃（confirmDiscard=true）→ confirmDiscard 调用 1 次后调桥 close', async () => {
    const fake = createFakeBridge()
    const projectFile = createFakeProjectFile(true)
    const wrapper = await mountControls(fake, projectFile)

    await wrapper.findAll('.win-btn')[2].trigger('click')
    await flushPromises()

    expect(projectFile.confirmDiscard).toHaveBeenCalledTimes(1)
    expect(fake.bridge.close).toHaveBeenCalledTimes(1)
  })

  it('关闭：未保存确认取消（confirmDiscard=false）→ 不调桥', async () => {
    const fake = createFakeBridge()
    const projectFile = createFakeProjectFile(false)
    const wrapper = await mountControls(fake, projectFile)

    await wrapper.findAll('.win-btn')[2].trigger('click')
    await flushPromises()

    // 确认对话框弹过（confirmDiscard 被调用）但用户取消 → 中止关闭
    expect(projectFile.confirmDiscard).toHaveBeenCalledTimes(1)
    expect(fake.bridge.close).not.toHaveBeenCalled()
  })

  it('关闭：无 projectFile 注入（如测试环境）→ 跳过确认直接调桥（兜底）', async () => {
    const fake = createFakeBridge()
    const wrapper = await mountControls(fake) // 不 provide projectFile

    await wrapper.findAll('.win-btn')[2].trigger('click')
    await flushPromises()

    expect(fake.bridge.close).toHaveBeenCalledTimes(1)
  })

  it('isMaximized() 初值报告已最大化 → 渲染还原图标（CopyOutline）而非最大化图标', async () => {
    const fake = createFakeBridge()
    fake.setMaximized(true)
    const wrapper = await mountControls(fake)
    // 初值经挂载后的异步 IPC 查询到达
    await flushPromises()

    expect(wrapper.findComponent(CopyOutline).exists()).toBe(true)
    expect(wrapper.findComponent(SquareOutline).exists()).toBe(false)
  })

  it('onMaximizedChange 事件推送 → 最大化按钮图标随状态切换（方框⇄双框）', async () => {
    const fake = createFakeBridge()
    const wrapper = await mountControls(fake)
    // 初值未最大化：方框（最大化）图标
    expect(wrapper.findComponent(SquareOutline).exists()).toBe(true)
    expect(wrapper.findComponent(CopyOutline).exists()).toBe(false)

    // 主进程通知已最大化 → 切为双框（还原）图标
    fake.emitMaximized(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(CopyOutline).exists()).toBe(true)
    expect(wrapper.findComponent(SquareOutline).exists()).toBe(false)

    // 通知还原 → 切回方框（最大化）图标
    fake.emitMaximized(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(SquareOutline).exists()).toBe(true)
    expect(wrapper.findComponent(CopyOutline).exists()).toBe(false)
  })

  it('卸载时取消 onMaximizedChange 订阅', async () => {
    const fake = createFakeBridge()
    const wrapper = await mountControls(fake)
    expect(fake.bridge.onMaximizedChange).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    expect(fake.unsubscribed).toBe(true)
  })
}, 20000)
