import { ref, computed, type Ref } from 'vue'
import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import { useStorage } from '@vueuse/core'
import type { NodePresetStyle, ConnectionPresetStyle, PresetGroup } from '@/types'
import { t } from '@/composables/useT'
import {
  DEFAULT_NODE_PRESETS,
  DEFAULT_CONNECTION_PRESETS,
  BUILTIN_PRESET_GROUP_ID,
  BUILTIN_PRESET_GROUP_KEY,
} from '@/constants'

/**
 * 分组筛选值：
 * - 'all'：查看全部预设
 * - 'ungrouped'：仅查看未分组预设
 * - 其他字符串：对应分组 id
 */
export type PresetGroupFilter = 'all' | 'ungrouped' | string

/** 预设类型（节点 / 连线） */
export type PresetKind = 'node' | 'connection'

/**
 * 全局预设样式 Store
 *
 * 管理节点和连线的预设样式列表，支持 CRUD 和拖拽排序，并支持预设分组。
 * 节点与连线的分组【完全独立】：各自拥有自己的分组列表（nodeGroups /
 * connectionGroups）、各自的分组 CRUD，以及各自的分组筛选状态
 * （nodeGroupFilter / connectionGroupFilter）。给连线加分组不影响节点分组，
 * 删除节点分组也不影响连线分组。
 *
 * 数据通过 useStorage 持久化到 localStorage，首次加载自动初始化默认预设，
 * 并各自创建不可删除的"内置"保留分组，内置预设默认归入其中。
 *
 * 1-9 快捷键应用的正是当前类型可见列表（visibleNodePresets /
 * visibleConnectionPresets）中的预设。
 */
export const usePresetsStore = defineStore('presets', () => {
  // ── State（localStorage 持久化） ──

  const nodePresets = useStorage<NodePresetStyle[]>('bb-preset-nodes', [])
  const connectionPresets = useStorage<ConnectionPresetStyle[]>('bb-preset-connections', [])
  /** 节点预设分组（独立） */
  const nodeGroups = useStorage<PresetGroup[]>('bb-preset-node-groups', [])
  /** 连线预设分组（独立） */
  const connectionGroups = useStorage<PresetGroup[]>('bb-preset-connection-groups', [])
  /** 节点分组筛选（决定 visibleNodePresets 与 1-9 快捷键作用列表） */
  const nodeGroupFilter = useStorage<PresetGroupFilter>('bb-preset-node-group-filter', 'all')
  /** 连线分组筛选（决定 visibleConnectionPresets 与 1-9 快捷键作用列表） */
  const connectionGroupFilter = useStorage<PresetGroupFilter>('bb-preset-connection-group-filter', 'all')

  /** 分组列表 ref（按类型） */
  function groupsRef(type: PresetKind) {
    return type === 'node' ? nodeGroups : connectionGroups
  }

  // ── 初始化与校验 ──

  /** 重置某存储：删除损坏文件并回退默认值 */
  function resetStorage<E>(ref: Ref<E>, fallback: E, key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      /* 忽略清理失败 */
      console.error('Failed to remove localStorage item:', key)
    }
    ref.value = fallback
  }

  /** 校验各存储：JSON 解析失败或结构不符 → 删除坏文件并回退默认 */
  function validateStorages(): void {
    if (!isValidPresetArray(nodePresets.value, 'node')) {
      resetStorage(nodePresets, [], 'bb-preset-nodes')
    }
    if (!isValidPresetArray(connectionPresets.value, 'connection')) {
      resetStorage(connectionPresets, [], 'bb-preset-connections')
    }
    if (!isValidGroupsArray(nodeGroups.value)) {
      resetStorage(nodeGroups, [], 'bb-preset-node-groups')
    }
    if (!isValidGroupsArray(connectionGroups.value)) {
      resetStorage(connectionGroups, [], 'bb-preset-connection-groups')
    }
    if (typeof nodeGroupFilter.value !== 'string') {
      resetStorage(nodeGroupFilter, 'all', 'bb-preset-node-group-filter')
    }
    if (typeof connectionGroupFilter.value !== 'string') {
      resetStorage(connectionGroupFilter, 'all', 'bb-preset-connection-group-filter')
    }
  }

  /** 清理指向不存在分组的孤儿筛选值 */
  function sanitizeFilters(): void {
    const validNode = nodeGroupFilter.value === 'all' || nodeGroupFilter.value === 'ungrouped'
      || nodeGroups.value.some((g) => g.id === nodeGroupFilter.value)
    if (!validNode) nodeGroupFilter.value = 'all'
    const validConn = connectionGroupFilter.value === 'all'
      || connectionGroupFilter.value === 'ungrouped'
      || connectionGroups.value.some((g) => g.id === connectionGroupFilter.value)
    if (!validConn) connectionGroupFilter.value = 'all'
  }

  /** 确保某类型的"内置"保留分组存在 */
  function ensureBuiltinGroup(type: PresetKind): void {
    const ref = groupsRef(type)
    if (ref.value.some((g) => g.id === BUILTIN_PRESET_GROUP_ID)) return
    // 有意行为：分组名仅在初始化建组时机经 t() 固化为当前语言文本写入数据，
    // 已存 localStorage 的旧数据不追溯重译
    ref.value = [
      { id: BUILTIN_PRESET_GROUP_ID, name: t(BUILTIN_PRESET_GROUP_KEY), builtin: true },
      ...ref.value,
    ]
  }

  /** 迁移旧版连线预设：补充缺失的 applyText 字段（默认 false，沿用旧行为：应用时写入连线文字） */
  function migrateConnectionPresets(): void {
    connectionPresets.value = connectionPresets.value.map((p) =>
      typeof p.applyText === 'boolean' ? p : { ...p, applyText: false },
    )
  }

  function initDefaults(): void {
    migrateConnectionPresets()
    validateStorages()
    ensureBuiltinGroup('node')
    ensureBuiltinGroup('connection')
    sanitizeFilters()

    if (nodePresets.value.length === 0) {
      // 有意行为：默认预设名仅在初始化时机经 t() 固化为当前语言文本写入数据，
      // 已存 localStorage 的旧数据不追溯重译；nameKey 不写入持久化数据
      nodePresets.value = DEFAULT_NODE_PRESETS.map((p) => ({
        name: t(p.nameKey),
        borderColor: p.borderColor,
        id: nanoid(),
        type: 'node' as const,
        groupId: BUILTIN_PRESET_GROUP_ID,
      }))
    }

    if (connectionPresets.value.length === 0) {
      // 有意行为：同上，名称经 t(nameKey) 固化，nameKey 不写入持久化数据
      connectionPresets.value = DEFAULT_CONNECTION_PRESETS.map((p) => ({
        name: t(p.nameKey),
        lineStyle: p.lineStyle,
        strokeWidth: p.strokeWidth,
        strokeColor: p.strokeColor,
        directed: p.directed,
        applyText: p.applyText,
        id: nanoid(),
        type: 'connection' as const,
        groupId: BUILTIN_PRESET_GROUP_ID,
      }))
    }
  }

  // ── 分组筛选（可见列表） ──

  function filterByGroup<T extends { groupId: string | null }>(
    list: T[],
    filter: PresetGroupFilter,
  ): T[] {
    if (filter === 'all') return list
    if (filter === 'ungrouped') return list.filter((p) => p.groupId == null)
    return list.filter((p) => p.groupId === filter)
  }

  /** 节点分组筛选下可见的节点预设（1-9 快捷键作用于该列表） */
  const visibleNodePresets = computed(() => filterByGroup(nodePresets.value, nodeGroupFilter.value))
  /** 连线分组筛选下可见的连线预设（1-9 快捷键作用于该列表） */
  const visibleConnectionPresets = computed(() =>
    filterByGroup(connectionPresets.value, connectionGroupFilter.value),
  )

  /** 某类型某筛选值对应的"新建预设默认分组"：为具体分组则返回该 id，否则未分组 */
  function defaultGroupIdFor(type: PresetKind, filter: PresetGroupFilter): string | null {
    if (filter === 'all' || filter === 'ungrouped') return null
    return groupsRef(type).value.some((g) => g.id === filter) ? filter : null
  }

  /** 新建节点预设的默认分组 */
  const currentNodeGroupId = computed<string | null>(() =>
    defaultGroupIdFor('node', nodeGroupFilter.value),
  )
  /** 新建连线预设的默认分组 */
  const currentConnectionGroupId = computed<string | null>(() =>
    defaultGroupIdFor('connection', connectionGroupFilter.value),
  )

  function setNodeGroupFilter(filter: PresetGroupFilter): void {
    nodeGroupFilter.value = filter
  }

  function setConnectionGroupFilter(filter: PresetGroupFilter): void {
    connectionGroupFilter.value = filter
  }

  /** 按类型与 id 取分组；不存在返回 null */
  function getGroup(type: PresetKind, id: string | null): PresetGroup | null {
    if (id == null) return null
    return groupsRef(type).value.find((g) => g.id === id) ?? null
  }

  /** 分组名（未分组返回 null） */
  function groupName(type: PresetKind, id: string | null): string | null {
    return getGroup(type, id)?.name ?? null
  }

  // ── 分组 CRUD（按类型独立） ──

  function addGroup(type: PresetKind, name: string): PresetGroup {
    const ref = groupsRef(type)
    const g: PresetGroup = { id: nanoid(), name, builtin: false }
    ref.value = [...ref.value, g]
    return g
  }

  function updateGroup(type: PresetKind, id: string, name: string): void {
    if (id === BUILTIN_PRESET_GROUP_ID) return
    const ref = groupsRef(type)
    ref.value = ref.value.map((g) => (g.id === id ? { ...g, name } : g))
  }

  /** 删除某类型分组（内置分组不可删）；该类型下该分组预设转为未分组 */
  function deleteGroup(type: PresetKind, id: string): void {
    if (id === BUILTIN_PRESET_GROUP_ID) return
    const ref = groupsRef(type)
    ref.value = ref.value.filter((g) => g.id !== id)
    if (type === 'node') {
      nodePresets.value = nodePresets.value.map((p) =>
        p.groupId === id ? { ...p, groupId: null } : p,
      )
      if (nodeGroupFilter.value === id) nodeGroupFilter.value = 'all'
    } else {
      connectionPresets.value = connectionPresets.value.map((p) =>
        p.groupId === id ? { ...p, groupId: null } : p,
      )
      if (connectionGroupFilter.value === id) connectionGroupFilter.value = 'all'
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

  /** 全列表重排（右侧边栏/浮动编辑器使用，全列表索引） */
  function reorderNodePresets(fromIndex: number, toIndex: number): void {
    const arr = [...nodePresets.value]
    const [moved] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, moved)
    nodePresets.value = arr
  }

  /** 可见（筛选后）列表重排：在筛选视图内排序，同时保持未显示项相对位置 */
  function reorderVisibleNodePresets(fromIndex: number, toIndex: number): void {
    nodePresets.value = reorderVisible(nodePresets.value, visibleNodePresets.value, fromIndex, toIndex)
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

  /** 全列表重排（右侧边栏/浮动编辑器使用，全列表索引） */
  function reorderConnectionPresets(fromIndex: number, toIndex: number): void {
    const arr = [...connectionPresets.value]
    const [moved] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, moved)
    connectionPresets.value = arr
  }

  /** 可见（筛选后）列表重排 */
  function reorderVisibleConnectionPresets(fromIndex: number, toIndex: number): void {
    connectionPresets.value = reorderVisible(
      connectionPresets.value,
      visibleConnectionPresets.value,
      fromIndex,
      toIndex,
    )
  }

  // ── 初始化 ──

  initDefaults()

  return {
    nodePresets,
    connectionPresets,
    nodeGroups,
    connectionGroups,
    nodeGroupFilter,
    connectionGroupFilter,
    visibleNodePresets,
    visibleConnectionPresets,
    currentNodeGroupId,
    currentConnectionGroupId,
    setNodeGroupFilter,
    setConnectionGroupFilter,
    getGroup,
    groupName,
    addGroup,
    updateGroup,
    deleteGroup,
    addNodePreset,
    updateNodePreset,
    deleteNodePreset,
    reorderNodePresets,
    reorderVisibleNodePresets,
    addConnectionPreset,
    updateConnectionPreset,
    deleteConnectionPreset,
    reorderConnectionPresets,
    reorderVisibleConnectionPresets,
  }
})

/**
 * 结构校验：某类型预设数组（关键字段齐全）。
 * 不要求 id 全局唯一去重，仅校验形状。
 */
function isValidPresetArray(value: unknown, type: 'node' | 'connection'): boolean {
  if (!Array.isArray(value)) return false
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false
    const o = item as Record<string, unknown>
    if (typeof o.id !== 'string' || typeof o.name !== 'string' || o.type !== type) return false
    if (o.groupId !== null && typeof o.groupId !== 'string') return false
    if (type === 'node') return typeof o.borderColor === 'string'
    return (
      typeof o.lineStyle === 'string' &&
      typeof o.strokeWidth === 'number' &&
      typeof o.strokeColor === 'string' &&
      typeof o.directed === 'boolean' &&
      typeof o.applyText === 'boolean'
    )
  })
}

/** 结构校验：分组数组（id 与 name 齐全） */
function isValidGroupsArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false
    const o = item as Record<string, unknown>
    return typeof o.id === 'string' && typeof o.name === 'string'
  })
}

/**
 * 在"筛选后可见列表"内重排，并把结果合并回全列表，
 * 保持未显示项在原始全列表中的相对位置不变。
 */
function reorderVisible<T extends { id: string; groupId: string | null }>(
  full: T[],
  visible: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (fromIndex < 0 || fromIndex >= visible.length || toIndex < 0 || toIndex >= visible.length) {
    return full
  }
  const newVisible = [...visible]
  const [moved] = newVisible.splice(fromIndex, 1)
  newVisible.splice(toIndex, 0, moved)

  const visibleIds = new Set(visible.map((p) => p.id))
  const result: T[] = []
  let ptr = 0
  for (const item of full) {
    if (visibleIds.has(item.id)) {
      result.push(newVisible[ptr] ?? item)
      ptr++
    } else {
      result.push(item)
    }
  }
  return result
}