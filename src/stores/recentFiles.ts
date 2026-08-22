import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { generateId } from '@/utils/id'

/**
 * recentFiles store - 最近打开的项目文件
 *
 * 记录「打开 / 另存为 / 作为最近打开」过的项目，供顶部「打开最近文件」子菜单使用。
 * 浏览器没有文件系统路径，因此直接内联存储项目 JSON 文本到 localStorage，
 * 选择最近项时无需再次读取文件即可载入。
 *
 * 数据由 useStorage 持久化到 localStorage（key: 'aidea-recent-files'）。
 */
export interface RecentFile {
  /** 唯一标识（同 name 只需一条，重开会更新 id/lastOpenedAt） */
  id: string
  /** 文件名（含 .aidea.json 后缀） */
  name: string
  /** 项目 JSON 文本 */
  content: string
  /** 最近打开时间戳 */
  lastOpenedAt: number
}

/** 最多保留的最近文件数量 */
const MAX_RECENT = 8
/** 单条内容长度护栏：超大项目不入最近列表，避免撑爆 localStorage */
const MAX_CONTENT_CHARS = 200000

export const useRecentFilesStore = defineStore('recentFiles', () => {
  const list = useStorage<RecentFile[]>('aidea-recent-files', [])

  /** 记录（或刷新）一个最近文件：同名去重，并按最近打开时间降序（最新在最前），裁剪超量 */
  function add(name: string, content: string): void {
    if (!name || !content) return
    if (content.length > MAX_CONTENT_CHARS) return
    const entry: RecentFile = {
      id: generateId(),
      name,
      content,
      lastOpenedAt: Date.now(),
    }
    // 先去掉同名旧项，并入新项后按 lastOpenedAt 降序排序（新项时间最大 → 排在第一）
    list.value = [entry, ...list.value.filter((f) => f.name !== name)]
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, MAX_RECENT)
  }

  /** 按 id 移除一条最近文件 */
  function remove(id: string): void {
    list.value = list.value.filter((f) => f.id !== id)
  }

  /** 清空全部最近文件 */
  function clear(): void {
    list.value = []
  }

  return { list, add, remove, clear }
})