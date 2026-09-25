/**
 * api/file.ts —— 项目文件域：序列化 / 解析 / 文件状态只读（纯数据，不依赖 DOM 文件句柄）。
 * 仅暴露安全的最小读接口；完整「导入进应用 + 标记 dirty」在 composables/useProjectFile.ts
 * （依赖 useMessage / 文件句柄），不臆造文件系统 API——插件可用 parse() 只读预览后组合命令层落地。
 */
import { useNodeStore } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useViewStore } from '@/stores/view'
import { useFileStore } from '@/stores/file'
import { useTagsStore } from '@/stores/tags'
import { useAdditionsStore } from '@/stores/additions'
import { t } from '@/composables/useT'
import {
  serializeProject,
  parseProjectFile,
  type ProjectViewState,
  type ParsedProject,
} from '@/utils/projectFile'

export function createFileApi() {
  const api = {
    /** 序列化当前项目为 JSON 字符串（与保存文件同构） */
    serializeCurrent(): string {
      const nodeStore = useNodeStore()
      const project = useProjectStore()
      const view = useViewStore('main')
      const nodes = Array.from(nodeStore.nodes.values())
      const projectName = nodeStore.rootNode?.text || t('common.untitledProject')

      const viewState: ProjectViewState = {
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
        tabs: project.tabs.map((tb) => ({ id: tb.id, viewedNodeId: tb.viewedNodeId })),
        activeTabId: project.activeTabId,
      }

      const tags = useTagsStore().tagList
      return serializeProject(nodes, projectName, viewState, tags, useAdditionsStore().serialize())
    },

    /** 解析校验项目文件 JSON（只读，不落到 store；失败抛错） */
    parse(json: string): ParsedProject {
      return parseProjectFile(json)
    },

    /** 是否有未保存改动 */
    dirty(): boolean {
      return useFileStore().dirty
    },

    /** 建议的保存文件名（项目名 + '.aidea.json'） */
    suggestedName(): string {
      return useFileStore().suggestedName
    },
  }
  return api
}

export type FileApi = ReturnType<typeof createFileApi>