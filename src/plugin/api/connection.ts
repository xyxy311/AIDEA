/**
 * api/connection.ts —— 连线域：查询 + 连线写
 * 接口类型由实现派生（`ConnectionApi = ReturnType<typeof createConnectionApi>`）。
 */
import type { Connection, LineStyle } from '@/types/node'
import { useNodeStore } from '@/stores/node'
import { useCommands } from '@/composables/useCommands'

export function createConnectionApi() {
  const api = {
    list(parentId: string): Connection[] {
      return useNodeStore().getConnections(parentId)
    },
    find(connectionId: string): { parentId: string; connection: Connection } | null {
      return useNodeStore().findConnectionById(connectionId)
    },
    add(parentId: string, fromNodeId: string, toNodeId: string): string | null {
      return useCommands().addConnection(parentId, fromNodeId, toNodeId)
    },
    remove(parentId: string, connIds: string[]): void {
      useCommands().deleteConnections(parentId, connIds)
    },
    removeByIds(connIds: string[]): void {
      useCommands().deleteConnectionsByIds(connIds)
    },
    update(
      parentId: string,
      connectionId: string,
      partial: Partial<Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed' | 'text'>>,
    ): void {
      useCommands().updateConnection(parentId, connectionId, partial)
    },
    updateStyleByIds(
      connIds: string[],
      partial: { lineStyle?: LineStyle; strokeWidth?: number; strokeColor?: string; directed?: boolean; text?: string | null },
    ): void {
      useCommands().updateConnectionsStyleByIds(connIds, partial)
    },
    /** 应用连线预设样式（走可撤销写入） */
    applyPreset(
      parentId: string,
      connectionId: string,
      preset: Pick<Connection, 'lineStyle' | 'strokeWidth' | 'strokeColor' | 'directed'>,
    ): void {
      useCommands().updateConnection(parentId, connectionId, {
        lineStyle: preset.lineStyle,
        strokeWidth: preset.strokeWidth,
        strokeColor: preset.strokeColor,
        directed: preset.directed,
      })
    },
  }
  return api
}

export type ConnectionApi = ReturnType<typeof createConnectionApi>