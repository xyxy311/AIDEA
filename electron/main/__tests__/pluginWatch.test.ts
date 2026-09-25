// @vitest-environment node
/**
 * pluginWatch.test.ts —— 插件 watch 纯逻辑单测（指纹 / 快照比对 / debounce）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopPluginInfo } from '../../shared/bridge'
import { createDebouncer, diffPluginSnapshots, fingerprintInfo } from '../pluginWatch'

// electron 在 vitest(node) 下不可加载：mock 掉顶层 import
vi.mock('electron', () => ({ app: {}, BrowserWindow: { getAllWindows: () => [] } }))

/** 构造 DesktopPluginInfo（形状对齐 shared/bridge.ts：id/entry/manifest/error?） */
function makeInfo(overrides: Partial<DesktopPluginInfo> = {}): DesktopPluginInfo {
  return {
    id: 'hello',
    entry: 'plugin.js',
    manifest: { id: 'hello', name: '你好插件', version: '1.0.0', sdkVersion: '1.0.0' },
    ...overrides,
  }
}

/** 用 (id, info, entryHash) 列表构建快照 Map（值 = fingerprintInfo 产物，模拟接线层 buildSnapshot） */
function snap(entries: Array<[string, DesktopPluginInfo, string]>): Map<string, string> {
  return new Map(entries.map(([id, info, hash]) => [id, fingerprintInfo(info, hash)]))
}

describe('fingerprintInfo', () => {
  it('相同输入 → 指纹稳定（多次调用、同构对象均一致）', () => {
    const info = makeInfo()
    expect(fingerprintInfo(info, 'hash-1')).toBe(fingerprintInfo(info, 'hash-1'))
    expect(fingerprintInfo(info, 'hash-1')).toBe(fingerprintInfo(makeInfo(), 'hash-1'))
  })

  it('entry 文件名不同 → 指纹不同', () => {
    expect(fingerprintInfo(makeInfo(), 'h')).not.toBe(fingerprintInfo(makeInfo({ entry: 'index.js' }), 'h'))
  })

  it('manifest 可见字段不同 → 指纹不同', () => {
    const renamed = makeInfo({ manifest: { id: 'hello', name: '改名了', version: '1.0.0', sdkVersion: '1.0.0' } })
    expect(fingerprintInfo(makeInfo(), 'h')).not.toBe(fingerprintInfo(renamed, 'h'))
  })

  it('manifest null 与有值 → 指纹不同', () => {
    expect(fingerprintInfo(makeInfo(), 'h')).not.toBe(fingerprintInfo(makeInfo({ manifest: null }), 'h'))
  })

  it('error 出现与否 → 指纹不同', () => {
    expect(fingerprintInfo(makeInfo(), 'h')).not.toBe(
      fingerprintInfo(makeInfo({ error: 'manifest.json 无效：字段 sdkVersion 须为非空字符串' }), 'h'),
    )
  })

  it('入口内容 hash 不同 → 指纹不同（同 id 内容修改靠它感知）', () => {
    expect(fingerprintInfo(makeInfo(), 'h1')).not.toBe(fingerprintInfo(makeInfo(), 'h2'))
  })
})

describe('diffPluginSnapshots', () => {
  it('新增：before 无 after 有 → 报告新增 id', () => {
    const before = snap([['a', makeInfo({ id: 'a' }), 'h']])
    const after = snap([
      ['a', makeInfo({ id: 'a' }), 'h'],
      ['b', makeInfo({ id: 'b' }), 'h'],
    ])
    expect(diffPluginSnapshots(before, after)).toEqual(['b'])
  })

  it('删除：before 有 after 无 → 报告删除 id', () => {
    const before = snap([
      ['a', makeInfo({ id: 'a' }), 'h'],
      ['b', makeInfo({ id: 'b' }), 'h'],
    ])
    const after = snap([['a', makeInfo({ id: 'a' }), 'h']])
    expect(diffPluginSnapshots(before, after)).toEqual(['b'])
  })

  it('修改（四组）：entry 变 / manifest 字段变 / error 出现 / hash 变，均报告该 id', () => {
    const before = snap([['x', makeInfo({ id: 'x' }), 'h']])

    const entryChanged = snap([['x', makeInfo({ id: 'x', entry: 'index.js' }), 'h']])
    expect(diffPluginSnapshots(before, entryChanged)).toEqual(['x'])

    const manifestChanged = snap([
      ['x', makeInfo({ id: 'x', manifest: { id: 'x', name: 'X', version: '2.0.0', sdkVersion: '1.0.0' } }), 'h'],
    ])
    expect(diffPluginSnapshots(before, manifestChanged)).toEqual(['x'])

    const errorAppeared = snap([['x', makeInfo({ id: 'x', error: 'manifest.json 无效' }), 'h']])
    expect(diffPluginSnapshots(before, errorAppeared)).toEqual(['x'])

    const hashChanged = snap([['x', makeInfo({ id: 'x' }), 'h2']])
    expect(diffPluginSnapshots(before, hashChanged)).toEqual(['x'])
  })

  it('无变化（含 touch 后内容未变的噪音）→ 空列表（不推送）', () => {
    const before = snap([['a', makeInfo({ id: 'a' }), 'h']])
    const after = snap([['a', makeInfo({ id: 'a' }), 'h']])
    expect(diffPluginSnapshots(before, after)).toEqual([])
  })

  it('空快照 ↔ 非空快照：全量新增 / 全量删除', () => {
    const withOne = snap([['a', makeInfo({ id: 'a' }), 'h']])
    expect(diffPluginSnapshots(new Map(), withOne)).toEqual(['a'])
    expect(diffPluginSnapshots(withOne, new Map())).toEqual(['a'])
  })

  it('多插件混合（增/删/改/不变）：输出为变更 id 并按字典序排序', () => {
    const a = makeInfo({ id: 'a' })
    const b = makeInfo({ id: 'b' })
    const c = makeInfo({ id: 'c' })
    // a 删除 / b 修改（hash 变）/ c 不变
    const before = snap([
      ['a', a, 'h'],
      ['b', b, 'h'],
      ['c', c, 'h'],
    ])
    const after = snap([
      ['b', b, 'h2'],
      ['c', c, 'h'],
      ['d', makeInfo({ id: 'd' }), 'h'],
    ])
    expect(diffPluginSnapshots(before, after)).toEqual(['a', 'b', 'd'])
  })

  it('排序稳定性：同样的快照集合换构建顺序 → 输出一致', () => {
    const a = makeInfo({ id: 'a' })
    const b = makeInfo({ id: 'b' })
    const c = makeInfo({ id: 'c' })
    const beforeShuffled = snap([
      ['c', c, 'h'],
      ['a', a, 'h'],
      ['b', b, 'h'],
    ])
    const afterShuffled = snap([
      ['d', makeInfo({ id: 'd' }), 'h'],
      ['b', b, 'h2'],
      ['c', c, 'h'],
    ])
    expect(diffPluginSnapshots(beforeShuffled, afterShuffled)).toEqual(['a', 'b', 'd'])
  })
})

describe('createDebouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('300ms 窗口内多次 push → 只执行一次（最后一次起算）', () => {
    const task = vi.fn()
    const d = createDebouncer(300, task)
    d.push()
    d.push()
    d.push()
    vi.advanceTimersByTime(299)
    expect(task).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('push 间隔重置窗口：299ms 处再 push 则执行时刻顺延', () => {
    const task = vi.fn()
    const d = createDebouncer(300, task)
    d.push()
    vi.advanceTimersByTime(299)
    d.push() // 窗口重置
    vi.advanceTimersByTime(299)
    // 若窗口不重置，此刻应已执行一次——重置语义下仍未执行
    expect(task).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('窗口过期后再 push → 各执行一次', () => {
    const task = vi.fn()
    const d = createDebouncer(300, task)
    d.push()
    vi.advanceTimersByTime(300)
    expect(task).toHaveBeenCalledTimes(1)
    d.push()
    vi.advanceTimersByTime(300)
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('cancel：取消未执行的任务；此后仍可重新 push', () => {
    const task = vi.fn()
    const d = createDebouncer(300, task)
    d.push()
    d.cancel()
    vi.advanceTimersByTime(1000)
    expect(task).not.toHaveBeenCalled()
    d.push()
    vi.advanceTimersByTime(300)
    expect(task).toHaveBeenCalledTimes(1)
  })
})
