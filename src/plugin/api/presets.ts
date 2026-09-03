/**
 * api/presets.ts —— 预设域：节点 / 连线预设的 CRUD 与分组筛选查询
 * 接口类型由实现派生（`PresetsApi = ReturnType<typeof createPresetsApi>`）。
 *
 * 职责边界：本域只管预设**增删改查 / 分组 / 筛选查询**（localStorage 视图级状态，
 * 不经 undo 命令层，故不带 user）。把预设**应用**到节点 / 连线属于节点 / 连线操作，
 * 已归 node / connection 域（`node.applyPresetById` / `connection.applyPresetById`），
 * 走可撤销命令层（`useCommands`）。
 */
import type { NodePresetStyle, ConnectionPresetStyle, PresetGroup } from '@/types'
import { usePresetsStore, type PresetKind, type PresetGroupFilter } from '@/stores/presets'

export function createPresetsApi() {
  const api = {
    // ── 只读查询 ──

    /** 全部节点预设 */
    nodePresets(): NodePresetStyle[] {
      return usePresetsStore().nodePresets
    },
    /** 全部连线预设 */
    connectionPresets(): ConnectionPresetStyle[] {
      return usePresetsStore().connectionPresets
    },
    /** 节点预设分组（与连线分组完全独立） */
    nodeGroups(): PresetGroup[] {
      return usePresetsStore().nodeGroups
    },
    /** 连线预设分组 */
    connectionGroups(): PresetGroup[] {
      return usePresetsStore().connectionGroups
    },
    /** 当前节点分组筛选值（'all' | 'ungrouped' | 分组 id） */
    nodeGroupFilter(): PresetGroupFilter {
      return usePresetsStore().nodeGroupFilter
    },
    /** 当前连线分组筛选值 */
    connectionGroupFilter(): PresetGroupFilter {
      return usePresetsStore().connectionGroupFilter
    },
    /** 节点分组筛选下可见的节点预设（1-9 快捷键作用列表） */
    visibleNodePresets(): NodePresetStyle[] {
      return usePresetsStore().visibleNodePresets
    },
    /** 连线分组筛选下可见的连线预设 */
    visibleConnectionPresets(): ConnectionPresetStyle[] {
      return usePresetsStore().visibleConnectionPresets
    },
    /** 取某类预设分组；不存在返回 null */
    getGroup(type: PresetKind, id: string | null): PresetGroup | null {
      return usePresetsStore().getGroup(type, id)
    },

    // ── 预设 / 分组 CRUD（视图级状态，不经 undo） ──

    addNodePreset(preset: Omit<NodePresetStyle, 'id' | 'type'>): NodePresetStyle {
      return usePresetsStore().addNodePreset(preset)
    },
    updateNodePreset(id: string, updates: Partial<Omit<NodePresetStyle, 'id' | 'type'>>): void {
      usePresetsStore().updateNodePreset(id, updates)
    },
    deleteNodePreset(id: string): void {
      usePresetsStore().deleteNodePreset(id)
    },
    addConnectionPreset(preset: Omit<ConnectionPresetStyle, 'id' | 'type'>): ConnectionPresetStyle {
      return usePresetsStore().addConnectionPreset(preset)
    },
    updateConnectionPreset(
      id: string,
      updates: Partial<Omit<ConnectionPresetStyle, 'id' | 'type'>>,
    ): void {
      usePresetsStore().updateConnectionPreset(id, updates)
    },
    deleteConnectionPreset(id: string): void {
      usePresetsStore().deleteConnectionPreset(id)
    },
  }
  return api
}

export type PresetsApi = ReturnType<typeof createPresetsApi>