// @vitest-environment node
// electron/main/mcp/__tests__/limiter.test.ts —— 并发 + 频率护栏单测
import { describe, expect, it } from 'vitest'
import { CallLimiter } from '../limiter'

describe('CallLimiter（并发上限）', () => {
  it('达到并发上限拒绝（concurrency），release 后恢复', () => {
    const limiter = new CallLimiter(2, 100)
    expect(limiter.tryAcquire('c1')).toBe('ok')
    expect(limiter.tryAcquire('c1')).toBe('ok')
    expect(limiter.tryAcquire('c2')).toBe('concurrency')
    limiter.release()
    expect(limiter.tryAcquire('c2')).toBe('ok')
    expect(limiter.activeCount()).toBe(2)
  })

  it('release 不产生负数', () => {
    const limiter = new CallLimiter(1, 10)
    limiter.release()
    limiter.release()
    expect(limiter.activeCount()).toBe(0)
  })
})

describe('CallLimiter（滑动窗口频率）', () => {
  it('窗口内超出 maxPerMinute 拒绝（rate），不占并发槽', () => {
    const limiter = new CallLimiter(10, 3)
    let now = 1_000_000
    expect(limiter.tryAcquire('ip', now)).toBe('ok')
    expect(limiter.tryAcquire('ip', now)).toBe('ok')
    expect(limiter.tryAcquire('ip', now)).toBe('ok')
    expect(limiter.tryAcquire('ip', now)).toBe('rate')
    expect(limiter.activeCount()).toBe(3)
  })

  it('窗口滑出后恢复；窗口保留未过期记录', () => {
    const limiter = new CallLimiter(10, 2)
    let now = 2_000_000
    limiter.tryAcquire('ip', now)
    limiter.tryAcquire('ip', now)
    expect(limiter.tryAcquire('ip', now + 1000)).toBe('rate')
    // 60s 后最早的记录滑出
    now += 60_001
    expect(limiter.tryAcquire('ip', now)).toBe('ok')
    expect(limiter.tryAcquire('ip', now)).toBe('ok')
    expect(limiter.tryAcquire('ip', now)).toBe('rate')
  })

  it('不同客户端独立计数', () => {
    const limiter = new CallLimiter(10, 1)
    const now = 3_000_000
    expect(limiter.tryAcquire('a', now)).toBe('ok')
    expect(limiter.tryAcquire('b', now)).toBe('ok')
    expect(limiter.tryAcquire('a', now)).toBe('rate')
  })

  it('matches 反映配置变化（重建实例判定）', () => {
    const limiter = new CallLimiter(4, 120)
    expect(limiter.matches(4, 120)).toBe(true)
    expect(limiter.matches(8, 120)).toBe(false)
  })
})
