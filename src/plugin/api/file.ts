/**
 * api/file.ts —— 项目文件域：项目序列化 / 解析（纯数据，不依赖 DOM 文件句柄）
 * 接口类型由实现派生（`FileApi = ReturnType<typeof createFileApi>`）。
 *
 * 安全面说明：
 * - `serializeCurrent()`：把当前项目导出为 JSON 字符串（与保存文件同构，纯数据处理）。
 * - `parse()`：把 JSON 字符串解析校验为项目数据（只读，不落到 store）。
 * - `dirty()` / `suggestedName()`：文件状态只读。
 *
 * 设计取舍：
 * - 全量「导入进应用 + 标记 dirty」入口（`loadProjectIntoApp`）位于
 *   `composables/useProjectFile.ts` 且依赖组件上下文（useMessage / 文件句柄），
 *   为避免与单一数据源分叉、不臆造文件系统 API，此处不暴露 UI 化的打开/保存，
 *   仅暴露安全的最小读接口。对完整导入有需求的插件可先用 `parse()` 做只读预览，
 *   再经 `api.node` / `api.project` 等命令层组合落地。
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