/**
 * api/connection.ts —— 连线域：查询 + 连线写
 * 写方法统一委托 useCommands()（唯一数据写入口，走历史）；查询返回深拷贝，不暴露内部响应式状态。
 * 写方法均带可选 `user` 参数为操作者归因预留（当前版本不消费）。
 */
import type { Connection, LineStyle } from '@/types/node'
import { useNodeStore } from '@/stores/node'
import { usePresetsStore } from '@/stores/presets'
import { useCommands } from '@/composables/useCommands'
import { deepClone } from '@/utils/command'

export function createConnectionApi() {
  const api = {
    /** 列出某父级下的全部连线（深拷贝） */
    list(parentId: string): Connection[] {
      return useNodeStore().getConnections(parentId).map((c) => deepClone(c))
    },
    /** 按连线 ID 全局查找，返回所属父级 + 连线（深拷贝）；不存在返回 null */
    find(connectionId: string): { parentId: string; connection: Connection } | null {
      const found = useNodeStore().findConnectionById(connectionId)
      return found ? { parentId: found.parentId, connection: deepClone(found.connection) } : null
    },
    add(parentId: string, fromNodeId: string, toNodeId: string, user?: string): string | null {
      void user
      return useCommands().addConnection(parentId, fromNodeId, toNodeId)
    },
    /** 按父级删除一批连线 */
    remove(parentId: string, connIds: string[], user?: string): void {
      void user
      useCommands().deleteConnections(parentId, connIds)
    },
    /** 按连线 ID 跨父级批量删除（自动定位各自所属父级） */
    removeByIds(connIds: string[], user?: string): void {
      void user
      useCommands().deleteConnectionsByIds(connIds)
    },
    /** 按单一连线 ID 直接删除（内部经 deleteConnectionsByIds 定位所属父级） */
    delete(connectionId: string, user?: string): void {
      void user
      useCommands().deleteConnectionsByIds([connectionId])
    },
    /** 将连线迁移挂到目标父级下（命令层按"原父删除 + 目标父新增"合并为单条历史） */
    move(fromParentId: string, toParentId: string, connIds: string[], user?: string): void {
      void user
      useCommands().moveConnections(fromParentId, toParentId, connIds)
    },
    update(
      parentId: string,
      connectionId: string,
      partial: Partial<Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed' | 'text'>>,
      user?: string,
    ): void {
      void user
      useCommands().updateConnection(parentId, connectionId, partial)
    },
    /** 按父级 + 连线 ID 列表批量更新样式 */
    updateStyle(
      parentId: string,
      connIds: string[],
      partial: {
        lineStyle?: LineStyle
        strokeWidth?: number
        strokeColor?: string
        directed?: boolean
        text?: string | null
      },
      user?: string,
    ): void {
      void user
      useCommands().updateConnectionsStyle(parentId, connIds, partial)
    },
    /** 按连线 ID 全局批量更新样式（支持跨父级） */
    updateStyleByIds(
      connIds: string[],
      partial: {
        lineStyle?: LineStyle
        strokeWidth?: number
        strokeColor?: string
        directed?: boolean
        text?: string | null
      },
      user?: string,
    ): void {
      void user
      useCommands().updateConnectionsStyleByIds(connIds, partial)
    },
    /**
     * 应用连线预设样式（走可撤销写入）；applyText 为真时把 preset.name 写入连线文字。
     * useCommands 无 applyConnectionPreset 命令，故由既有 updateConnection 组合实现。
     */
    applyPreset(
      parentId: string,
      connectionId: string,
      preset: Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed'> & {
        name?: string
        applyText?: boolean
      },
      user?: string,
    ): void {
      void user
      useCommands().updateConnection(
        parentId,
        connectionId,
        {
          lineStyle: preset.lineStyle,
          strokeWidth: preset.strokeWidth,
          strokeColor: preset.strokeColor,
          directed: preset.directed,
          ...(preset.applyText && preset.name ? { text: preset.name } : {}),
        },
      )
    },
    /**
     * 按预设 ID 应用连线预设样式（改写线型 / 线宽 / 线色 / 方向；applyText 为真时写入预设名）。
     * 经 useCommands 可撤销命令层；预设或连线不存在返回 false，不写历史。
     */
    applyPresetById(connectionId: string, presetId: string, user?: string): boolean {
      void user
      const preset = usePresetsStore().connectionPresets.find((p) => p.id === presetId)
      const found = useNodeStore().findConnectionById(connectionId)
      if (!preset || !found) return false
      useCommands().updateConnectionsStyleByIds(
        [connectionId],
        {
          lineStyle: preset.lineStyle,
          strokeWidth: preset.strokeWidth,
          strokeColor: preset.strokeColor,
          directed: preset.directed,
          text: preset.applyText ? preset.name : null,
        },
      )
      return true
    },
  }
  return api
}

export type ConnectionApi = ReturnType<typeof createConnectionApi>