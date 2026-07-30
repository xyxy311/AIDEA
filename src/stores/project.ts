import { ref, computed } from 'vue'
import { defineStore, getActivePinia } from 'pinia'
import type { WhiteboardData } from '@/types'
import { generateId } from '@/utils/id'
import { useWhiteboardStore } from '@/stores/whiteboard'

/**
 * 项目 Store — 管理项目级元数据
 *
 * 职责：
 * - 项目名称
 * - 白板列表（索引、名称）
 * - 当前活跃白板 ID
 *
 * 不存储具体节点或导航状态——这些属于每个白板自己的 store。
 */
export const useProjectStore = defineStore('project', () => {
  // ── State ──

  /** 项目名称 */
  const projectName = ref('未命名项目')

  /** 白板列表 */
  const whiteboards = ref<WhiteboardData[]>([
    { id: 'default', name: '新白板' },
  ])

  /** 当前活跃白板 ID */
  const activeWhiteboardId = ref('default')

  // ── Getters ──

  /** 当前活跃白板对象 */
  const activeWhiteboard = computed<WhiteboardData | undefined>(() =>
    whiteboards.value.find((w) => w.id === activeWhiteboardId.value),
  )

  /** 白板总数 */
  const whiteboardCount = computed(() => whiteboards.value.length)

  /**
   * 根白板 ID（项目白板）。
   * 项目白板始终位于列表首位，无父级、不可删除。
   */
  const rootWhiteboardId = computed(() => whiteboards.value[0]?.id ?? '')

  // ── Actions ──

  function setProjectName(name: string): void {
    projectName.value = name
  }

  function addWhiteboard(name?: string, id?: string, parentId?: string): string {
    const wbId = id ?? generateId()
    // 若该 ID 已被占用（例如节点已关联白板后重复创建），直接返回不重复添加
    if (whiteboards.value.some((w) => w.id === wbId)) {
      return wbId
    }
    whiteboards.value.push({
      id: wbId,
      name: name ?? '新白板',
      parentId,
    })
    return wbId
  }

  function removeWhiteboard(id: string): void {
    // 根白板（项目白板）不可删除
    if (id === rootWhiteboardId.value) return
    if (whiteboards.value.length <= 1) return
    const idx = whiteboards.value.findIndex((w) => w.id === id)
    if (idx === -1) return
    whiteboards.value.splice(idx, 1)

    if (activeWhiteboardId.value === id) {
      activeWhiteboardId.value = rootWhiteboardId.value
    }

    // 销毁对应的 Pinia store
    const pinia = getActivePinia()
    if (pinia) {
      ;((pinia as unknown) as { _s: Map<string, unknown> })._s.delete(`whiteboard-${id}`)
    }
  }

  /**
   * 递归删除白板及其所有子白板（销毁 store + 列表项 + 活跃白板回退）。
   *
   * 不触碰父白板中的关联节点--节点清理由 whiteboard store 的 deleteNode 负责。
   * 供「删除节点连带删白板」「右键取消关联」等场景复用。
   */
  function removeWhiteboardWithDescendants(wbId: string): void {
    if (wbId === rootWhiteboardId.value) return
    if (!whiteboards.value.some((w) => w.id === wbId)) return

    // 收集后代（含自身）
    const descendants: string[] = []
    const visited = new Set<string>()
    function collect(id: string): void {
      if (visited.has(id)) return
      visited.add(id)
      descendants.push(id)
      for (const w of whiteboards.value) {
        if (w.parentId === id) collect(w.id)
      }
    }
    collect(wbId)

    // 若活跃白板在被删子树中，先切换到根白板
    if (descendants.includes(activeWhiteboardId.value)) {
      switchWhiteboard(rootWhiteboardId.value)
    }

    // 逐个删除（removeWhiteboard 内部销毁 store 并处理列表）
    for (const id of descendants) {
      removeWhiteboard(id)
    }
  }

  function switchWhiteboard(id: string): void {
    if (!whiteboards.value.find((w) => w.id === id)) return
    activeWhiteboardId.value = id
    // 重置目标白板的交互状态
    useWhiteboardStore(id).resetBoardState()
  }

  function renameWhiteboard(id: string, name: string): void {
    const wb = whiteboards.value.find((w) => w.id === id)
    if (!wb || !name.trim()) return
    wb.name = name.trim()
  }

  return {
    // State
    projectName,
    whiteboards,
    activeWhiteboardId,
    // Getters
    activeWhiteboard,
    whiteboardCount,
    rootWhiteboardId,
    // Actions
    setProjectName,
    addWhiteboard,
    removeWhiteboard,
    removeWhiteboardWithDescendants,
    switchWhiteboard,
    renameWhiteboard,
  }
})
