import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { WhiteboardData } from '@/types'
import { generateId } from '@/utils/id'

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

  // ── Actions ──

  function setProjectName(name: string): void {
    projectName.value = name
  }

  function addWhiteboard(name?: string): string {
    const id = generateId()
    whiteboards.value.push({
      id,
      name: name ?? '新白板',
    })
    return id
  }

  function removeWhiteboard(id: string): void {
    if (whiteboards.value.length <= 1) return
    const idx = whiteboards.value.findIndex((w) => w.id === id)
    if (idx === -1) return
    whiteboards.value.splice(idx, 1)

    if (activeWhiteboardId.value === id) {
      activeWhiteboardId.value = whiteboards.value[0]!.id
    }
  }

  function switchWhiteboard(id: string): void {
    if (!whiteboards.value.find((w) => w.id === id)) return
    activeWhiteboardId.value = id
  }

  return {
    // State
    projectName,
    whiteboards,
    activeWhiteboardId,
    // Getters
    activeWhiteboard,
    whiteboardCount,
    // Actions
    setProjectName,
    addWhiteboard,
    removeWhiteboard,
    switchWhiteboard,
  }
})
