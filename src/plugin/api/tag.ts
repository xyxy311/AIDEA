/**
 * api/tag.ts —— 标签域：只读
 * 标签定义 CRUD 属项目级操作，后续按需开放。接口类型由实现派生。
 */
import type { Tag } from '@/types/node'
import { useTagsStore } from '@/stores/tags'

export function createTagApi() {
  const api = {
    list(): Tag[] {
      return useTagsStore().tagList
    },
    get(id: string): Tag | undefined {
      return useTagsStore().getTag(id)
    },
  }
  return api
}

export type TagApi = ReturnType<typeof createTagApi>