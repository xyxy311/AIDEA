import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { PluginManager } from '@/plugin/manager'
import type { PluginEntry } from '@/plugin/manager'
import { SDK_VERSION } from '@/plugin/adapter'
import type { AideaPlugin, PluginContext } from '@/plugin/adapter'

/** 构造单个插件装载项，可注入各类异常 */
function makeEntry(
  id: string,
  opts: { throwsOnSetup?: boolean; sdkMismatch?: boolean; idMismatch?: boolean; missingDefault?: boolean } = {},
): PluginEntry {
  const plugin: AideaPlugin = {
    manifest: {
      id: opts.idMismatch ? `${id}-x` : id,
      name: id,
      version: '0.1.0',
      description: '',
      author: 'tests',
      sdkVersion: opts.sdkMismatch ? '9' : SDK_VERSION,
    },
    setup():
      void {
      if (opts.throwsOnSetup) throw new Error(`boom-${id}`)
    },
  }
  return { id, loader: async () => (opts.missingDefault ? {} : { default: plugin }) }
}

function makeManager(entries: PluginEntry[], enabled: Record<string, boolean>) {
  const mgr = new PluginManager({
    entries,
    getEnabled: () => ({ ...enabled }),
  })
  return { mgr, enabled }
}

describe('PluginManager', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('装载启动时启用的插件并调 setup，未启用的不调 setup', async () => {
    const setupCalls: string[] = []
    let idx = 0
    // 用动态 setup 追踪
    const mk = (id: string): PluginEntry => ({
      id,
      loader: async () => {
        idx += 1
        return {
          default: {
            manifest: { id, name: id, version: '0.1.0', sdkVersion: SDK_VERSION },
            setup(ctx: PluginContext): void {
              setupCalls.push(id)
              void ctx
            },
          },
        }
      },
    })

    const { mgr } = makeManager([mk('a'), mk('b')], { a: true })
    await mgr.installAll()

    expect(setupCalls).toEqual(['a'])
    expect(mgr.getRecords().map((r) => `${r.id}:${r.status}`)).toContain('a:active')
    expect(mgr.getRecords().map((r) => `${r.id}:${r.status}`)).toContain('b:installed')
  })

  it('上下文形状：register / modal / manifest / onDispose（不再携带 adapter）', async () => {
    let keys: string[] = []
    let registerShapeOk = false
    let modalShapeOk = false
    let manifestId = ''
    const entry: PluginEntry = {
      id: 'shape',
      loader: async () => ({
        default: {
          manifest: { id: 'shape', name: 'shape', version: '0.1.0', sdkVersion: SDK_VERSION },
          setup(ctx: PluginContext): void {
            keys = Object.keys(ctx).sort()
            registerShapeOk =
              typeof ctx.register?.registerPanel === 'function' &&
              typeof ctx.register?.registerTopBarButton === 'function' &&
              typeof ctx.register?.registerSettingsCategory === 'function' &&
              typeof ctx.register?.registerContextMenuItem === 'function' &&
              typeof ctx.register?.registerShortcutAction === 'function'
            modalShapeOk =
              typeof ctx.modal?.open === 'function' &&
              typeof ctx.modal?.close === 'function'
            manifestId = ctx.manifest.id
          },
        },
      }),
    }

    const { mgr } = makeManager([entry], { shape: true })
    await mgr.installAll()

    // 内部形态额外带 dispose()；不再有 adapter
    expect(keys).toEqual(['dispose', 'manifest', 'modal', 'onDispose', 'register'])
    expect(registerShapeOk).toBe(true)
    expect(modalShapeOk).toBe(true)
    expect(manifestId).toBe('shape')
  })

  it('启停切换仅更新启用意愿 → 重启（新实例装载）才生效，不动态调 setup', async () => {
    const { mgr, enabled } = makeManager(
      [makeEntry('a'), makeEntry('b')],
      { a: true },
    )
    await mgr.installAll()
    expect(mgr.getRecords().find((r) => r.id === 'b')!.status).toBe('installed')

    mgr.setEnabled('b', true)

    const rec = mgr.getRecords().find((r) => r.id === 'b')!
    expect(rec.enabled).toBe(true)
    expect(rec.status).toBe('installed') // 重启前仍是 installed，不动态调 setup

    // 模拟 store 持久化（manager 不落地）+ 重启：新的启用快照下重建实例 → b 被激活
    enabled.b = true
    const restarted = new PluginManager({
      entries: [makeEntry('a'), makeEntry('b')],
      getEnabled: () => ({ ...enabled }),
    })
    await restarted.installAll()
    expect(restarted.getRecords().find((r) => r.id === 'b')!.status).toBe('active')
  })

  it('单插件 setup 抛错仅置该插件 error，不影响其他', async () => {
    const { mgr } = makeManager(
      [makeEntry('good'), makeEntry('bad', { throwsOnSetup: true })],
      { good: true, bad: true },
    )
    await mgr.installAll()

    const good = mgr.getRecords().find((r) => r.id === 'good')!
    const bad = mgr.getRecords().find((r) => r.id === 'bad')!
    expect(good.status).toBe('active')
    expect(bad.status).toBe('error')
    expect(bad.error).toContain('boom-bad')
  })

  it('SDK 大版本不匹配 → 置 error 而非启用', async () => {
    const { mgr } = makeManager([makeEntry('old', { sdkMismatch: true })], { old: true })
    await mgr.installAll()

    const rec = mgr.getRecords()[0]
    expect(rec.status).toBe('error')
    expect(rec.error).toContain('SDK')
  })

  it('setup 抛错时先触发已注册的 onDispose 回调（错误隔离清理）', async () => {
    const disposed: string[] = []
    let called = false
    const entry: PluginEntry = {
      id: 'leaky',
      loader: async () => ({
        default: {
          manifest: { id: 'leaky', name: 'leaky', version: '0.1.0', sdkVersion: SDK_VERSION },
          setup(ctx: PluginContext): void {
            called = true
            ctx.onDispose(() => disposed.push('leaky-disposed'))
            throw new Error('boom')
          },
        },
      }),
    }

    const { mgr } = makeManager([entry], { leaky: true })
    await mgr.installAll()

    expect(called).toBe(true)
    const rec = mgr.getRecords()[0]
    expect(rec.status).toBe('error')
    expect(disposed).toEqual(['leaky-disposed'])
  })

  it('manifest id 与装载源不一致 → 置 error', async () => {
    const { mgr } = makeManager([makeEntry('a', { idMismatch: true })], { a: true })
    await mgr.installAll()

    const rec = mgr.getRecords()[0]
    expect(rec.status).toBe('error')
    expect(rec.id).toBe('a')
    expect(rec.error).toContain('不匹配')
  })

  it('onChange 订阅收到记录快照变化', async () => {
    const { mgr } = makeManager([makeEntry('a', { throwsOnSetup: true })], { a: true })
    const listener = vi.fn()
    mgr.onChange(listener)

    await mgr.installAll()

    expect(listener).toHaveBeenCalledTimes(1)
    const snapshot = listener.mock.calls[0][0] as { id: string; status: string }[]
    expect(snapshot.length).toBe(1)
    expect(snapshot[0].id).toBe('a')
    expect(snapshot[0].status).toBe('error')
  })
})