import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import { useStorage } from '@vueuse/core'
import type { NodePresetStyle, ConnectionPresetStyle } from '@/types'
import { DEFAULT_NODE_PRESETS, DEFAULT_CONNECTION_PRESETS } from '@/constants'

/**
 * 全局预设样式 Store
 *
 * 管理节点和连线的预设样式列表，支持 CRUD 和拖拽排序。
 * 数据通过 useStorage 持久化到 localStorage，首次加载时自动初始化默认预设。
 */
export const usePresetsStore = defineStore('presets', () => {
  // ── State（localStorage 持久化） ──

  const nodePresets = useStorage<NodePresetStyle[]>('bb-preset-nodes', [])
  const connectionPresets = useStorage<ConnectionPresetStyle[]>('bb-preset-connections', [])

  // ── 初始化默认预设 ──

  function initDefaults(): void {
    if (nodePresets.value.length === 0) {
      nodePresets.value = DEFAULT_NODE_PRESETS.map((p) => ({
        ...p,
        id: nanoid(),
        type: 'node' as const,
      }))
    }
    if (connectionPresets.value.length === 0) {
      connectionPresets.value = DEFAULT_CONNECTION_PRESETS.map((p) => ({
        ...p,
        id: nanoid(),
        type: 'connection' as const,
      }))
    }
  }

  // ── 节点预设 CRUD ──

  function addNodePreset(preset: Omit<NodePresetStyle, 'id' | 'type'>): NodePresetStyle {
    const newPreset: NodePresetStyle = {
      ...preset,
      id: nanoid(),
      type: 'node',
    }
    nodePresets.value = [...nodePresets.value, newPreset]
    return newPreset
  }

  function updateNodePreset(id: string, updates: Partial<Omit<NodePresetStyle, 'id' | 'type'>>): void {
    const idx = nodePresets.value.findIndex((p) => p.id === id)
    if (idx === -1) return
    const updated = [...nodePresets.value]
    updated[idx] = { ...updated[idx], ...updates }
    nodePresets.value = updated
  }

  function deleteNodePreset(id: string): void {
    nodePresets.value = nodePresets.value.filter((p) => p.id !== id)
  }

  function reorderNodePresets(fromIndex: number, toIndex: number): void {
    const arr = [...nodePresets.value]
    const [moved] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, moved)
    nodePresets.value = arr
  }

  // ── 连线预设 CRUD ──

  function addConnectionPreset(preset: Omit<ConnectionPresetStyle, 'id' | 'type'>): ConnectionPresetStyle {
    const newPreset: ConnectionPresetStyle = {
      ...preset,
      id: nanoid(),
      type: 'connection',
    }
    connectionPresets.value = [...connectionPresets.value, newPreset]
    return newPreset
  }

  function updateConnectionPreset(id: string, updates: Partial<Omit<ConnectionPresetStyle, 'id' | 'type'>>): void {
    const idx = connectionPresets.value.findIndex((p) => p.id === id)
    if (idx === -1) return
    const updated = [...connectionPresets.value]
    updated[idx] = { ...updated[idx], ...updates }
    connectionPresets.value = updated
  }

  function deleteConnectionPreset(id: string): void {
    connectionPresets.value = connectionPresets.value.filter((p) => p.id !== id)
  }

  function reorderConnectionPresets(fromIndex: number, toIndex: number): void {
    const arr = [...connectionPresets.value]
    const [moved] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, moved)
    connectionPresets.value = arr
  }

  // ── 初始化 ──

  initDefaults()

  // 兼容旧版预设（含 backgroundColor/textColor 字段）-> 仅保留 borderColor
  nodePresets.value = nodePresets.value.map((p) => ({
    id: p.id,
    name: p.name,
    type: 'node' as const,
    borderColor: p.borderColor,
  }))

  return {
    nodePresets,
    connectionPresets,
    addNodePreset,
    updateNodePreset,
    deleteNodePreset,
    reorderNodePresets,
    addConnectionPreset,
    updateConnectionPreset,
    deleteConnectionPreset,
    reorderConnectionPresets,
  }
})
