import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { generateId } from '@/utils/id'

/**
 * recentFiles store - 最近打开的项目文件
 *
 * 记录「打开 / 另存为 / 作为最近打开」过的项目，供顶部「打开最近文件」子菜单使用。
 * 纯桌面形态下磁盘归属 main 进程，最近列表只存「文件名 + 磁盘路径」，打开时经
 * aideaFile 桥（FILE_READ）重新读盘——不再像浏览器形态那样内联存项目 JSON 文本，
 * 因此不受体积上限约束，且文件内容改动在最近列表保持最新。
 *
 * 数据由 useStorage 持久化到 localStorage（key: 'aidea-recent-files'）。
 */
export interface RecentFile {
  /** 唯一标识（同 name 只需一条，重开会更新 id/lastOpenedAt） */
  id: string
  /** 文件名（含 .aidea.json 后缀） */
  name: string
  /** 项目文件磁盘路径（main 对话框产出，renderer 打开最近文件时回传给 FILE_READ） */
  path: string
  /** 最近打开时间戳 */
  lastOpenedAt: number
}

/** 最多保留的最近文件数量 */
const MAX_RECENT = 8

export const useRecentFilesStore = defineStore('recentFiles', () => {
  const list = useStorage<RecentFile[]>('aidea-recent-files', [])

  // 迁移/自愈：纯桌面收敛前浏览器形态存的是「内联 content、无 path」的旧条目，磁盘归 main
  // 后无法读盘，一次性丢弃（保留含合法 path 的路径式条目）。
  if (list.value.some((f) => typeof f.path !== 'string' || f.path === '')) {
    list.value = list.value.filter((f) => typeof f.path === 'string' && f.path !== '')
  }

  /** 记录（或刷新）一个最近文件：同名去重，并按最近打开时间降序（最新在最前），裁剪超量 */
  function add(name: string, path: string): void {
    if (!name || !path) return
    const entry: RecentFile = {
      id: generateId(),
      name,
      path,
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