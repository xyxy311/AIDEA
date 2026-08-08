import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import type { Tag } from '@/types'
import { useNodeStore } from '@/stores/node'
import { markDataDirty } from '@/utils/dirtyMarker'

/**
 * 标签定义 Store - 项目级标签定义
 *
 * 标签定义（Tag）是项目级数据，随项目文件序列化（不 localStorage 持久化）：
 * - CRUD 不可撤销：直接改 tags Map + markDataDirty()（属项目级操作，不经命令层）
 * - 仅"节点打标签"可撤销：走命令层 nodeChanges.modify 的 tagIds 字段
 *
 * 依赖方向：本 store 单向 import nodeStore（stripTagFromAllNodes 清关联），
 * node store 不 import tags store，因此不构成循环依赖。
 */
export const useTagsStore = defineStore('tags', () => {
  const nodeStore = useNodeStore()

  // ── State ──

  /** 全部标签定义：Map<tagId, Tag> */
  const tags = reactive(new Map<string, Tag>())

  /** 标签 id 顺序数组（支持拖拽排序） */
  const tagOrder = ref<string[]>([])

  // ── Getters ──

  /** 标签列表（按 tagOrder 排序） */
  const tagList = computed(() =>
    tagOrder.value.map((id) => tags.get(id)).filter((t): t is Tag => !!t),
  )

  // ── 查询 ──

  function getTag(id: string): Tag | undefined {
    return tags.get(id)
  }

  // ── 标签定义 CRUD（不可撤销，均标记脏） ──

  /** 新建并加入标签，返回新 Tag */
  function addTag(name: string, color = '#4fc3f7'): Tag {
    const tag: Tag = { id: nanoid(), name, color }
    tags.set(tag.id, tag)
    tagOrder.value = [...tagOrder.value, tag.id]
    markDataDirty()
    return tag
  }

  function renameTag(id: string, name: string): void {
    const tag = tags.get(id)
    if (!tag) return
    tag.name = name
    markDataDirty()
  }

  function updateTagColor(id: string, color: string): void {
    const tag = tags.get(id)
    if (!tag) return
    tag.color = color
    markDataDirty()
  }

  /** 删除标签，并从所有节点清关联 */
  function deleteTag(id: string): void {
    if (!tags.has(id)) return
    tags.delete(id)
    tagOrder.value = tagOrder.value.filter((o) => o !== id)
    nodeStore.stripTagFromAllNodes(id)
    markDataDirty()
  }

  // ── 项目级操作（不标记脏） ──

  /** 打开项目时整体替换标签定义 */
  function replaceTags(list: Tag[]): void {
    tags.clear()
    for (const tag of list) {
      tags.set(tag.id, tag)
    }
    tagOrder.value = list.map((t) => t.id)
  }

  /** 新建项目时清空标签定义 */
  function clearTags(): void {
    tags.clear()
    tagOrder.value = []
  }

  /** 拖拽排序：交换 until 顺序 */
  function reorderTag(fromIndex: number, toIndex: number): void {
    const arr = [...tagOrder.value]
    if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return
    const [moved] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, moved)
    tagOrder.value = arr
  }

  return {
    tags,
    tagList,
    getTag,
    addTag,
    renameTag,
    updateTagColor,
    deleteTag,
    replaceTags,
    clearTags,
    reorderTag,
  }
})