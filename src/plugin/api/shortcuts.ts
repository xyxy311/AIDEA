/**
 * api/shortcuts.ts —— 快捷键域：自定义键位查询（只读）
 * 接口类型由实现派生（`ShortcutsApi = ReturnType<typeof createShortcutsApi>`）。
 *
 * 安全面说明：仅暴露只读的键位查询（某 action 绑定哪些键 / 某键触发什么），
 * 不改写用户绑定（覆盖绑定属全局偏好，交由 UI 设置面板管理，避免插件意外篡改）。
 */
import { useShortcutsStore } from '@/stores/shortcuts'
import { CUSTOM_SHORTCUTS, type ShortcutDef } from '@/constants/shortcuts'

export function createShortcutsApi() {
  const api = {
    /** 取某自定义动作 id 的有效绑定（覆盖优先，未覆盖回退默认） */
    getBinding(id: string): string {
      return useShortcutsStore().getBinding(id)
    },
    /** 全部有效绑定（id -> 规范化 chord 字符串） */
    bindings(): Record<string, string> {
      return useShortcutsStore().bindings
    },
    /** 序号修饰键（按住它再按 1-9 表示打标签） */
    seqModKey(): string {
      return useShortcutsStore().seqModKey
    },
    /** 某 chord 是否被锁定键占用 */
    isReserved(chord: string): { reserved: boolean } {
      return useShortcutsStore().isReserved(chord)
    },
    /** 全部可自定义动作定义（id / labelKey / scope / 默认绑定） */
    listActions(): ShortcutDef[] {
      return CUSTOM_SHORTCUTS
    },
    /** 查询哪个自定义动作绑定到该 chord；未命中返回 null */
    findActionByChord(chord: string): string | null {
      const store = useShortcutsStore()
      for (const def of CUSTOM_SHORTCUTS) {
        if (store.getBinding(def.id) === chord) return def.id
      }
      return null
    },
  }
  return api
}

export type ShortcutsApi = ReturnType<typeof createShortcutsApi>