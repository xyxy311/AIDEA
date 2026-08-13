import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'
import { useViewStore } from '@/stores/view'
import { useFileStore } from '@/stores/file'
import { useTagsStore } from '@/stores/tags'
import { useCommands } from '@/composables/useCommands'
import { useMessage } from 'naive-ui'
import { t } from '@/composables/useT'
import {
  serializeProject,
  parseProjectFile,
  defaultProjectAIConfig,
  type ProjectViewState,
  type ProjectAIConfigData,
} from '@/utils/projectFile'
import { createNode } from '@/utils/factory'
import { generateId } from '@/utils/id'
import type { WhiteboardNode, Tag } from '@/types'

/**
 * useProjectFile - 项目文件编排层（新建 / 保存 / 打开）
 *
 * 核心是 collectViewState（收集主视图状态）与 loadProjectIntoApp（载入数据）。
 * 目录选择 / 保存 / 下载均为浏览器行为，本层只负责正确分支与提示。
 */

/** 确认回调：返回 true 表示确认放弃，false 表示取消 */
export type ProjectConfirmFn = (message: string) => Promise<boolean>

/** useProjectFile 返回的 API 类型 */
export type ProjectFileApi = ReturnType<typeof useProjectFile>

/** File System Access API 能力检测：两类 picker 都可用才认为支持 */
function isFileSystemAccessSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as {
    showSaveFilePicker?: unknown
    showOpenFilePicker?: unknown
  }
  return (
    typeof w.showSaveFilePicker === 'function' &&
    typeof w.showOpenFilePicker === 'function'
  )
}

/** 取消选择的哨兵（用于区分「用户取消」与真实错误） */
interface CancelSignal {
  cancelled: true
}

export function useProjectFile(options?: { confirm?: ProjectConfirmFn }) {
  const nodeStore = useNodeStore()
  const project = useProjectStore()
  const history = useHistoryStore()
  const commands = useCommands()
  const fileStore = useFileStore()
  const tagsStore = useTagsStore()
  const message = useMessage()

  const confirm = options?.confirm

  /** 确认是否放弃未保存改动；无改动或已确认放弃返回 true */
  async function confirmDiscard(): Promise<boolean> {
    if (!fileStore.dirty) return true
    if (!confirm) {
      message.warning(t('menuBar.unsavedConfirmNeeded'))
      return false
    }
    return await confirm(t('menuBar.unsavedConfirm'))
  }

  /** 收集主视图状态为可持久化 viewState */
  function collectViewState(): ProjectViewState {
    const view = useViewStore('main')
    return {
      viewedNodeId: view.viewedNodeId,
      stageX: view.stageX,
      stageY: view.stageY,
      stageScale: view.stageScale,
      expandedIds: Array.from(project.expandedIds),
      inlineViews: view.inlineViews.map((iv) => ({
        nodeId: iv.nodeId,
        width: iv.width,
        height: iv.height,
      })),
      selectedNodeIds: Array.from(view.selectedNodeIds),
      selectedConnectionIds: Array.from(view.selectedConnectionIds),
    }
  }

  /** 将项目数据载入应用（新建 / 打开共用） */
  function loadProjectIntoApp(data: {
    projectName: string
    nodes: WhiteboardNode[]
    tags?: Tag[]
    viewState: ProjectViewState
    aiConfig?: ProjectAIConfigData
  }): void {
    // 1. 整树替换，确保根节点存在
    const map = new Map<string, WhiteboardNode>()
    for (const n of data.nodes) map.set(n.id, n)
    if (!map.has(ROOT_NODE_ID)) {
      map.set(
        ROOT_NODE_ID,
        createNode({ id: ROOT_NODE_ID, parentId: null, text: data.projectName }),
      )
    }
    nodeStore.replaceNodes(map)

    // 1.5 替换标签定义（打开项目时恢复；新建时 data.tags 为空数组）
    tagsStore.replaceTags(data.tags ?? [])

    // 2. 清空撤销栈（整树替换不可撤销）
    commands.clearHistory()

    // 3. 重置项目级与主视图状态（不含历史，不触发 dirty）
    project.resetForNewProject()

    // 3.5 恢复 AI 配置（先清空节点覆盖，再设全局 / 默认 / 逐条覆盖）
    project.setGlobalPrompt(data.aiConfig?.globalPrompt ?? '')
    project.setDefaultAIConfig(
      data.aiConfig?.defaultConfig ?? defaultProjectAIConfig().defaultConfig,
    )
    for (const { nodeId, config } of data.aiConfig?.nodeConfigs ?? []) {
      if (map.has(nodeId)) project.setNodeAIConfig(nodeId, config)
    }

    const existingIds = new Set(map.keys())

    // 4. 恢复展开态（与现有节点交集，根节点必展开）
    const expanded = new Set<string>()
    for (const id of data.viewState.expandedIds) {
      if (existingIds.has(id)) expanded.add(id)
    }
    if (!expanded.has(ROOT_NODE_ID)) expanded.add(ROOT_NODE_ID)
    project.expandedIds = expanded

    // 5. 恢复 viewedNodeId：先归位 root，再切换到目标节点
    project.switchView(ROOT_NODE_ID)
    const targetView = data.viewState.viewedNodeId
    if (targetView && targetView !== ROOT_NODE_ID && existingIds.has(targetView)) {
      project.switchView(targetView)
    }

    const view = useViewStore('main')

    // 6. 恢复视口（需在 switchView 之后，避免被 restoreSnapshot 重置）
    view.setViewport(data.viewState.stageX, data.viewState.stageY, data.viewState.stageScale)

    // 7. 重建内联视图（对仍存在的 nodeId 创建实例 + addInlineView）
    for (const iv of data.viewState.inlineViews) {
      if (!existingIds.has(iv.nodeId)) continue
      const viewId = generateId()
      const ivView = useViewStore(viewId, {
        nodeId: iv.nodeId,
        type: 'inline',
        hostViewId: 'main',
      })
      ivView.stageX = 0
      ivView.stageY = 0
      ivView.stageScale = 1
      view.addInlineView(iv.nodeId, viewId, iv.width, iv.height)
    }

    // 8. 恢复选中（剔除不存在的节点 / 连线）
    const validConnIds = new Set<string>()
    for (const n of map.values()) {
      for (const c of n.connections) validConnIds.add(c.id)
    }
    const selNodes = new Set(
      data.viewState.selectedNodeIds.filter((id) => existingIds.has(id)),
    )
    const selConns = new Set(
      data.viewState.selectedConnectionIds.filter((id) => validConnIds.has(id)),
    )
    view.selectedNodeIds = selNodes
    view.selectedConnectionIds = selConns
  }

  /** 序列化当前项目为 JSON 字符串 */
  function buildProjectJson(): string {
    const nodes = Array.from(nodeStore.nodes.values())
    const projectName = nodeStore.rootNode?.text || t('common.untitledProject')
    const viewState = collectViewState()
    const tags = tagsStore.tagList
    // 收集当前 project store 的 AI 配置组装成可持久化数据
    const aiConfig: ProjectAIConfigData = {
      globalPrompt: project.globalPrompt,
      defaultConfig: project.defaultAIConfig,
      nodeConfigs: Array.from(project.nodeAIConfigs.entries()).map(([nodeId, config]) => ({
        nodeId,
        config,
      })),
    }
    return serializeProject(nodes, projectName, viewState, tags, aiConfig)
  }

  /** 默认保存文件名（项目名 + '.aidea.json'） */
  function defaultFileName(): string {
    const name = nodeStore.rootNode?.text?.trim() || t('common.untitledProject')
    return `${name}.aidea.json`
  }

  /** 下载兜底：Blob + <a download> 触发下载 */
  function downloadProject(json: string, fileName: string): void {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /** 读取项目文件内容（优先 showOpenFilePicker，否则 input[type=file] 兜底） */
  function readProjectFile(): Promise<{
    text: string
    handle: FileSystemFileHandle | null
  }> {
    return new Promise((resolve, reject) => {
      if (isFileSystemAccessSupported()) {
        const w = window as unknown as {
          showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>
        }
        w.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: '头脑风暴白板项目',
              accept: { 'application/json': ['.aidea.json', '.json'] },
            },
          ],
        })
          .then(async (handles) => {
            const handle = handles[0]
            const text = await handle.getFile().then((file) => file.text())
            resolve({ text, handle })
          })
          .catch((err) => {
            if (err && err.name === 'AbortError') {
              reject({ cancelled: true } satisfies CancelSignal)
            } else {
              reject(err)
            }
          })
        return
      }
      // 兜底：input[type=file]
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.aidea.json,.json,application/json'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) {
          reject({ cancelled: true } satisfies CancelSignal)
          return
        }
        file
          .text()
          .then((text) => resolve({ text, handle: null }))
          .catch(reject)
      }
      input.click()
    })
  }

  /** 新建项目 */
  async function newProject(): Promise<void> {
    if (!(await confirmDiscard())) return
    const untitled = t('common.untitledProject')
    const root = createNode({ id: ROOT_NODE_ID, parentId: null, text: untitled })
    loadProjectIntoApp({
      projectName: untitled,
      nodes: [root],
      viewState: {
        viewedNodeId: ROOT_NODE_ID,
        stageX: 0,
        stageY: 0,
        stageScale: 1,
        expandedIds: [ROOT_NODE_ID],
        inlineViews: [],
        selectedNodeIds: [],
        selectedConnectionIds: [],
      },
    })
    fileStore.resetFileState()
    // 标签定义已由 loadProjectIntoApp 的 `tags ?? []` 兜底清空（无需重复 clearTags）
    message.success(t('menuBar.newProjectDone'))
  }

  /** 打开项目 */
  async function openProject(): Promise<void> {
    if (!(await confirmDiscard())) return
    try {
      const { text, handle } = await readProjectFile()
      const data = parseProjectFile(text)
      loadProjectIntoApp(data)
      // 记住打开的文件句柄，后续保存直接覆盖该文件；仅清 dirty，不清句柄
      fileStore.markClean()
      fileStore.setSavedHandle(handle)
      message.success(t('menuBar.opened'))
    } catch (e) {
      // 用户取消文件选择对话框不提示错误
      if (e && typeof e === 'object' && (e as CancelSignal).cancelled) return
      const msg = e instanceof Error ? e.message : String(e)
      message.error(t('menuBar.openFailed', { message: msg }))
    }
  }

  /** 保存项目（Ctrl+S 与菜单保存共用） */
  async function saveProject(): Promise<void> {
    const json = buildProjectJson()
    fileStore.suggestedName = defaultFileName()
    const handle = fileStore.getSavedHandle()
    if (handle) {
      try {
        const writable = await handle.createWritable()
        await writable.write(json)
        await writable.close()
        fileStore.markClean()
        message.success(t('menuBar.saved'))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        message.error(t('menuBar.saveFailed', { message: msg }))
      }
      return
    }
    // 无记忆句柄：走另存为逻辑
    await saveAsProject()
  }

  /** 另存为项目 */
  async function saveAsProject(): Promise<void> {
    const json = buildProjectJson()
    const name = defaultFileName()
    fileStore.suggestedName = name
    if (isFileSystemAccessSupported()) {
      try {
        const w = window as unknown as {
          showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>
        }
        const handle = await w.showSaveFilePicker({
          suggestedName: name,
          types: [
            {
              description: '头脑风暴白板项目',
              accept: { 'application/json': ['.aidea.json', '.json'] },
            },
          ],
        })
        const writable = await handle.createWritable()
        await writable.write(json)
        await writable.close()
        fileStore.setSavedHandle(handle)
        fileStore.markClean()
        message.success(t('menuBar.saved'))
      } catch (e) {
        // 用户取消（AbortError）不报错
        if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') {
          return
        }
        const msg = e instanceof Error ? e.message : String(e)
        message.error(t('menuBar.saveFailed', { message: msg }))
      }
      return
    }
    // 下载兜底
    downloadProject(json, name)
    fileStore.markClean()
    message.success(t('menuBar.saved'))
  }

  return {
    newProject,
    openProject,
    saveProject,
    saveAsProject,
    dirty: fileStore.dirty,
    suggestedName: fileStore.suggestedName,
  }
}