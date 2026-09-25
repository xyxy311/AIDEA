/**
 * api/tag.ts —— 标签域：只读 + 标签定义 CRUD
 * 标签 CRUD 属项目级操作，不可撤销（直接改 store + markDataDirty()，不经命令层），与 tags store 语义一致。
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
    /** 新建标签定义，返回新 Tag */
    add(name: string, color?: string): Tag {
      return useTagsStore().addTag(name, color)
    },
    /** 重命名标签 */
    rename(id: string, name: string): void {
      useTagsStore().renameTag(id, name)
    },
    /** 修改标签颜色 */
    updateColor(id: string, color: string): void {
      useTagsStore().updateTagColor(id, color)
    },
    /** 删除标签，并从所有节点清关联 */
    remove(id: string): void {
      useTagsStore().deleteTag(id)
    },
    /** 拖拽排序：移动 fromIndex 项到 toIndex */
    reorder(fromIndex: number, toIndex: number): void {
      useTagsStore().reorderTag(fromIndex, toIndex)
    },
    /** 清空全部标签定义 */
    clear(): void {
      useTagsStore().clearTags()
    },
  }
  return api
}

export type TagApi = ReturnType<typeof createTagApi>