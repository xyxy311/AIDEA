/**
 * api/tag.ts —— 标签域：只读 + 标签定义 CRUD
 * 标签定义 CRUD 属项目级操作，不可撤销（直接改 store + markDataDirty()，
 * 不经命令层），与 tags store 语义保持一致，故均不带 user 尾参。
 * 接口类型由实现派生。
 */
import type { Tag } from '@/types/node'
import { useTagsStore } from '@/stores/tags'

export function createTagApi() {
  const api = {
    /** 读取全部标签定义（按 tagOrder 排序，返回普通数组副本） */
    list(): Tag[] {
      return [...useTagsStore().tagList]
    },
    /** 按 id 读取单个标签定义 */
    get(id: string): Tag | undefined {
      return useTagsStore().getTag(id)
    },
    /** 新建标签定义，返回新 Tag（不可撤销） */
    add(name: string, color?: string): Tag {
      return useTagsStore().addTag(name, color)
    },
    /** 重命名标签（不可撤销） */
    rename(id: string, name: string): void {
      useTagsStore().renameTag(id, name)
    },
    /** 修改标签颜色（不可撤销） */
    updateColor(id: string, color: string): void {
      useTagsStore().updateTagColor(id, color)
    },
    /** 删除标签，并从所有节点清关联（不可撤销） */
    remove(id: string): void {
      useTagsStore().deleteTag(id)
    },
    /** 拖拽排序：移动 fromIndex 项到 toIndex（不可撤销） */
    reorder(fromIndex: number, toIndex: number): void {
      useTagsStore().reorderTag(fromIndex, toIndex)
    },
    /** 清空全部标签定义（不可撤销） */
    clear(): void {
      useTagsStore().clearTags()
    },
  }
  return api
}

export type TagApi = ReturnType<typeof createTagApi>