/**
 * watchUtils.ts —— 目录监听共用纯逻辑（pluginWatch / i18nWatch 复用）。
 */
/** 简易 debounce 工厂：ms 窗口内多次 push 只在最后一次 push 后 ms 执行一次 task；cancel() 取消未执行任务。 */
export function createDebouncer(ms: number, task: () => void): { push(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    push(): void {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        task()
      }, ms)
    },
    cancel(): void {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}

/**
 * 快照比对，返回变更 key 列表（增/删/指纹变）；输出按 key 字典序排序保证稳定性。
 */
export function diffSnapshots(before: Map<string, string>, after: Map<string, string>): string[] {
  const changed = new Set<string>()
  // 新增（before 无 → undefined）与修改（两边都有但指纹不同）在此一并捕获
  for (const [key, fp] of after) {
    if (before.get(key) !== fp) changed.add(key)
  }
  // 删除：before 有 after 无
  for (const key of before.keys()) {
    if (!after.has(key)) changed.add(key)
  }
  return [...changed].sort()
}