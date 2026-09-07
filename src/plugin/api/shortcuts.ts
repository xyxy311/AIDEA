/**
 * api/shortcuts.ts —— 快捷键域：只读查询
 * 接口类型由实现派生（`ShortcutsApi = ReturnType<typeof createShortcutsApi>`）。
 *
 * 安全面说明：
 * - 本域只暴露键位 / 登记查询，不改写用户绑定，也不承载动作注册——插件动作注册已移至
 *   注册面（ctx.register.registerShortcutAction，见 plugin/ui.ts）；覆盖绑定属全局偏好，
 *   交由 UI 设置面板管理，避免插件意外篡改。
 * - pluginActions(pluginId) 为只读登记查询：返回该插件在 uiRegistry.shortcutActions 中
 *   登记的动作（key = 完整登记 key、label = 成品字符串），供插件自身设置栏目渲染改键行。
 * - 无注册逻辑后共享实例与插件实例无作用域差异，故 createShortcutsApi 无参数；
 *   api.shortcuts 仅经共享 adapter.api 提供（无 per-plugin 版本）。
 */
import { useShortcutsStore } from '@/stores/shortcuts'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { CUSTOM_SHORTCUTS, type ShortcutDef } from '@/constants/shortcuts'

export function createShortcutsApi() {
  return {
    /** 取某自定义动作 id 的有效绑定（覆盖优先，未覆盖回退默认；插件动作传完整登记 key） */
    getBinding(id: string): string {
      return useShortcutsStore().getBinding(id)
    },
    /** 全部有效绑定（id（含插件完整 key）-> 规范化 chord 字符串） */
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
    /** 内置可自定义动作定义（id / labelKey / scope / 默认绑定）。仅返回内置，插件动作经 registry 查询 */
    listActions(): ShortcutDef[] {
      return CUSTOM_SHORTCUTS
    },
    /** 查询哪个动作（内置返回 id；插件动作返回完整登记 key `${pluginId}:${id}`）绑定到该 chord；未命中返回 null */
    findActionByChord(chord: string): string | null {
      const store = useShortcutsStore()
      for (const def of CUSTOM_SHORTCUTS) {
        if (store.getBinding(def.id) === chord) return def.id
      }
      const registry = useUiRegistryStore()
      for (const key of registry.shortcutActions.keys()) {
        if (store.getBinding(key) === chord) return key
      }
      return null
    },
    /**
     * 列出某插件登记的全部快捷键动作（按 `${pluginId}:` 前缀过滤）。
     * key = 完整登记 key（可直接传 getBinding / ShortcutActionRow 的 actionKey），
     * label = 成品字符串（插件不接主 i18n）。只读查询，无命中返回空数组。
     * 供插件自身设置栏目经 ShortcutActionRow 渲染改键行（主应用快捷键栏目不显示插件动作）。
     */
    pluginActions(pluginId: string): Array<{ key: string; label: string }> {
      const registry = useUiRegistryStore()
      const prefix = `${pluginId}:`
      const rows: Array<{ key: string; label: string }> = []
      for (const [key, entry] of registry.shortcutActions) {
        if (key.startsWith(prefix)) rows.push({ key, label: entry.def.label })
      }
      return rows
    },
  }
}

export type ShortcutsApi = ReturnType<typeof createShortcutsApi>
