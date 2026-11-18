/**
 * mcp/limiter.ts —— 全局并发 + 每客户端滑动窗口调用频率上限（纯函数可单测，无 electron 依赖）。
 * 超限返回结构化拒绝（'concurrency' | 'rate'），不静默排队。
 */
export type LimitVerdict = 'ok' | 'concurrency' | 'rate'

/** 滑动窗口长度（ms） */
const WINDOW_MS = 60_000

export class CallLimiter {
  private active = 0
  /** 各客户端（按 IP）最近调用时间戳（滑动窗口） */
  private hits = new Map<string, number[]>()

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxPerMinute: number,
  ) {}

  /** 当前配置是否与给定上限一致（配置变更时重建实例用） */
  matches(maxConcurrent: number, maxPerMinute: number): boolean {
    return this.maxConcurrent === maxConcurrent && this.maxPerMinute === maxPerMinute
  }

  /**
   * 尝试占用一个调用槽：先查并发上限，再查该客户端频率窗口。
   * ok 时必须配对 release()。
   */
  tryAcquire(clientKey: string, now = Date.now()): LimitVerdict {
    if (this.active >= this.maxConcurrent) return 'concurrency'
    const window = (this.hits.get(clientKey) ?? []).filter((t) => now - t < WINDOW_MS)
    if (window.length >= this.maxPerMinute) {
      this.hits.set(clientKey, window)
      return 'rate'
    }
    window.push(now)
    this.hits.set(clientKey, window)
    this.active++
    return 'ok'
  }

  /** 释放一个并发槽（与成功的 tryAcquire 配对） */
  release(): void {
    this.active = Math.max(0, this.active - 1)
  }

  /** 当前占用并发数（测试/诊断用） */
  activeCount(): number {
    return this.active
  }
}
