/**
 * aiProject - 项目级 AI 配置（插件命名空间 additions 数据）
 *
 * 原主程序版由 project store 的 AI 字段持有（globalPrompt / defaultAIConfig /
 * nodeAIConfigs，随项目文件序列化并标脏）；插件化后统一改为读写
 * scope.additions 的 `projectConfig` 键（完整键 `ai:projectConfig`）：
 * - 随项目文件保存、一次 set = 单条历史（可撤销），语义与原 markDataDirty 对齐；
 * - 读经 additions.get 取深拷贝快照（结构不符时归一为空白默认）；
 * - 写为整包 set（内部先改快照再落包，避免直接持有内部引用）。
 */
import { adapter } from '@/plugin/adapter'
import type { AIConfig } from '../types'
import { AI_PLUGIN_ID } from '../constants'

/** 本插件命名空间作用域（for 有模块级缓存，与插件入口 setup 拿到同一实例） */
const scope = adapter.for(AI_PLUGIN_ID)

/** additions 键：项目级 AI 配置整包（完整键 `ai:projectConfig`） */
const PROJECT_CONFIG_KEY = 'projectConfig'

/** 项目级 AI 数据（完整键 ai:projectConfig，随项目文件保存、写操作入 undo） */
export interface AIProjectData {
  /** 项目级全局提示词（独立于各节点配置） */
  globalPrompt: string
  /** AI 默认配置（未按节点覆盖时的回退值） */
  default: AIConfig
  /** 按节点覆盖的 AI 配置：nodeId -> AIConfig */
  byNode: Record<string, AIConfig>
}

/** 空白默认（与原 project store 初始 AI 字段一致） */
function emptyProjectData(): AIProjectData {
  return {
    globalPrompt: '',
    default: { localPrompt: '', mode: 'fast', viewTextAlgoId: 'collectAll' },
    byNode: {},
  }
}

/** 单条 AIConfig 归一（宽容 JSON 数据，缺字段回退 fallback） */
function normalizeAIConfig(raw: unknown, fallback: AIConfig): AIConfig {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const o = raw as Partial<AIConfig>
  return {
    localPrompt: typeof o.localPrompt === 'string' ? o.localPrompt : fallback.localPrompt,
    mode: o.mode === 'precise' ? 'precise' : 'fast',
    viewTextAlgoId:
      typeof o.viewTextAlgoId === 'string' && o.viewTextAlgoId.length > 0
        ? o.viewTextAlgoId
        : fallback.viewTextAlgoId,
  }
}

/** 整包归一：结构不符逐字段回退默认，保证读取方永远拿到完整可用结构 */
function normalize(raw: unknown): AIProjectData {
  const base = emptyProjectData()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Partial<AIProjectData>
  if (typeof o.globalPrompt === 'string') base.globalPrompt = o.globalPrompt
  base.default = normalizeAIConfig(o.default, base.default)
  if (o.byNode && typeof o.byNode === 'object' && !Array.isArray(o.byNode)) {
    for (const [nodeId, cfg] of Object.entries(o.byNode)) {
      base.byNode[nodeId] = normalizeAIConfig(cfg, base.default)
    }
  }
  return base
}

/** 读快照（深拷贝；无数据 / 结构不符时返回空白默认） */
export function loadProjectData(): AIProjectData {
  return normalize(scope.additions.get(PROJECT_CONFIG_KEY))
}

/** 整包写（一次 set = 单条历史，可撤销）；写入前做防御性浅拷贝，避免外部引用联动 */
export function saveProjectData(next: AIProjectData): void {
  scope.additions.set(PROJECT_CONFIG_KEY, {
    globalPrompt: next.globalPrompt,
    default: { ...next.default },
    byNode: Object.fromEntries(Object.entries(next.byNode).map(([k, v]) => [k, { ...v }])),
  })
}

/** 当前视图（观察节点）id（原 project.currentNodeId 的插件等价读法） */
export function currentViewedNodeId(): string {
  return adapter.api.view.active().viewedNodeId
}

/** 获取某节点的 AI 配置；未覆盖时回退默认配置（与原 project.getAIConfig 合并语义一致） */
export function getAIConfig(nodeId: string): AIConfig {
  const data = loadProjectData()
  return data.byNode[nodeId] ?? data.default
}

/** 设置项目级全局提示词 */
export function setGlobalPrompt(text: string): void {
  const data = loadProjectData()
  data.globalPrompt = text
  saveProjectData(data)
}

/** 设置 AI 默认配置（整体替换） */
export function setDefaultAIConfig(cfg: AIConfig): void {
  const data = loadProjectData()
  data.default = { ...cfg }
  saveProjectData(data)
}

/** 设置某节点的 AI 覆盖配置 */
export function setNodeAIConfig(nodeId: string, cfg: AIConfig): void {
  const data = loadProjectData()
  data.byNode[nodeId] = { ...cfg }
  saveProjectData(data)
}

/** 清除某节点的 AI 覆盖配置（回退到默认）；未覆盖时为 no-op */
export function clearNodeAIConfig(nodeId: string): void {
  const data = loadProjectData()
  if (!(nodeId in data.byNode)) return
  delete data.byNode[nodeId]
  saveProjectData(data)
}
