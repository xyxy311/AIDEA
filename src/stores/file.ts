import { ref } from 'vue'
import { defineStore } from 'pinia'
import { setMarkDirty } from '@/utils/dirtyMarker'

/**
 * file store - 项目文件状态（dirty 标记 / 建议保存名 / 已记忆保存路径）。
 * 不依赖 history store 避免循环依赖：dirty 经 setMarkDirty() 注入置位实现。
 */
export const useFileStore = defineStore('file', () => {
  /** 是否有未保存改动 */
  const dirty = ref<boolean>(false)
  /** 建议的保存文件名（默认项目名 + '.aidea.json'） */
  const suggestedName = ref<string>('')
  /** 已记忆的保存路径（main 对话框产出；null 表示未保存过或走另存为） */
  const savedPath = ref<string | null>(null)

  // 注册脏标记回调（history store 通过 markDataDirty 触发）
  setMarkDirty(() => {
    dirty.value = true
  })

  /** 标记为脏（有未保存改动） */
  function markDirty(): void {
    dirty.value = true
  }

  /** 标记为整洁（已保存） */
  function markClean(): void {
    dirty.value = false
  }

  /** 记录保存位置路径 */
  function setSavedPath(p: string | null): void {
    savedPath.value = p
  }

  /** 获取保存位置路径 */
  function getSavedPath(): string | null {
    return savedPath.value
  }

  /** 重置文件状态（新建 / 打开项目后调用） */
  function resetFileState(): void {
    dirty.value = false
    savedPath.value = null
  }

  return {
    dirty,
    suggestedName,
    savedPath,
    markDirty,
    markClean,
    setSavedPath,
    getSavedPath,
    resetFileState,
  }
})