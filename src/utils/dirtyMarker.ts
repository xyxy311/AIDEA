/**
 * dirtyMarker - 脏标记回调注册：解耦 history 与 file store（避免循环依赖）。
 */
let markDirtyFn: () => void = () => {}

/** 注册脏标记回调（由 file store 调用） */
export function setMarkDirty(fn: () => void): void {
  markDirtyFn = fn
}

/** 触发脏标记（由 history store 在数据变更后调用） */
export function markDataDirty(): void {
  markDirtyFn()
}