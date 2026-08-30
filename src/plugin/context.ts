/**
 * context.ts —— 构造 PluginContext（注入共享适配层 + 卸载钩子）
 *
 * PluginContext 的类型契约（PluginAdapter / PluginManifest / onDispose）在稳定壳
 * adapter.ts 定义；本文件负责**组装**：把共享 adapter 与 manifest 包进上下文，
 * 收集插件通过 onDispose 注册的清理函数，供 PluginManager 在卸载时统一触发。
 */
import type { PluginAdapter, PluginContext, PluginManifest } from './adapter'

/** PluginContext 内部形态：额外携带触发全部 onDispose 回调的 dispose() */
export interface InternalPluginContext extends PluginContext {
  /** 卸载：依次执行插件经 onDispose 注册的所有清理函数（单条抛错不影响其余） */
  dispose(): void
}

export function createPluginContext(
  adapter: PluginAdapter,
  manifest: PluginManifest,
): InternalPluginContext {
  const disposers: Array<() => void> = []

  return {
    adapter,
    manifest,
    onDispose(fn: () => void): void {
      disposers.push(fn)
    },
    dispose(): void {
      for (const fn of disposers.splice(0)) {
        try {
          fn()
        } catch (e) {
          // 单条清理函数抛错不阻断其余清理
          console.warn('[plugin] onDispose 回调抛错', e)
        }
      }
    },
  }
}