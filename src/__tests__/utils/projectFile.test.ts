import { describe, it, expect } from 'vitest'
import {
  serializeProject,
  parseProjectFile,
  defaultProjectAIConfig,
  PROJECT_FILE_VERSION,
  type ProjectViewState,
  type ProjectAIConfigData,
} from '@/utils/projectFile'
import { createNode } from '@/utils/factory'
import { ROOT_NODE_ID } from '@/stores/node'

/** AI 配置结构（与 utils/projectFile.ts 的 legacy AIConfig 一致） */
interface AIConfig {
  localPrompt: string
  mode: 'fast' | 'precise'
  viewTextAlgoId: string
}

/** 构造一个合法的 AI 配置 */
function validConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    localPrompt: '请从用户角度发散',
    mode: 'fast',
    viewTextAlgoId: 'collectAll',
    ...overrides,
  }
}

/** 构造一个合法的最小视图状态 */
function validViewState(): ProjectViewState {
  return {
    viewedNodeId: ROOT_NODE_ID,
    stageX: 0,
    stageY: 0,
    stageScale: 1,
    expandedIds: [ROOT_NODE_ID],
    inlineViews: [],
    selectedNodeIds: [],
    selectedConnectionIds: [],
  }
}

/** 构造一个最小合法项目 JSON 字符串（可覆盖任意字段） */
function buildProjectJson(overrides: Record<string, unknown> = {}): string {
  const base: Record<string, unknown> = {
    version: PROJECT_FILE_VERSION,
    projectName: '项目',
    nodes: [
      createNode({ id: ROOT_NODE_ID, parentId: null, text: '项目' }),
      createNode({ id: 'child1', parentId: ROOT_NODE_ID, text: '子节点' }),
    ],
    tags: [],
    viewState: validViewState(),
    aiConfig: defaultProjectAIConfig(),
    ...overrides,
  }
  return JSON.stringify(base)
}

describe('projectFile - 序列化', () => {
  it('serializeProject 不再写出 aiConfig 字段（AI 项目级配置归 ai 插件 additions）', () => {
    const nodes = [
      createNode({ id: ROOT_NODE_ID, parentId: null, text: '项目' }),
      createNode({ id: 'child1', parentId: ROOT_NODE_ID, text: '子节点' }),
    ]

    const json = serializeProject(nodes, '项目', validViewState(), [], { 'ai:projectConfig': { globalPrompt: '全局' } })
    const data = JSON.parse(json)

    // 新保存文件不含 aiConfig 字段；additions 原样写出
    expect(data.aiConfig).toBeUndefined()
    expect(data.additions).toEqual({ 'ai:projectConfig': { globalPrompt: '全局' } })
  })

  it('版本号恒为 1', () => {
    const nodes = [createNode({ id: ROOT_NODE_ID, parentId: null, text: '项目' })]
    const json = serializeProject(nodes, '项目', validViewState(), [], {})
    const data = JSON.parse(json)
    expect(data.version).toBe(1)
  })
})

describe('projectFile - aiConfig 解析', () => {
  it('解析合法 aiConfig 并保留', () => {
    const aiConfig: ProjectAIConfigData = {
      globalPrompt: '全局提示词',
      defaultConfig: validConfig({ mode: 'precise', viewTextAlgoId: 'rowCluster' }),
      nodeConfigs: [{ nodeId: 'child1', config: validConfig({ localPrompt: '节点局部提示' }) }],
    }

    const parsed = parseProjectFile(buildProjectJson({ aiConfig }))

    expect(parsed.aiConfig).toEqual(aiConfig)
    // legacy 标记：原文件携带 aiConfig 字段
    expect(parsed.hasAIConfig).toBe(true)
  })

  it('旧文件缺 aiConfig 字段 → 回退 defaultProjectAIConfig()', () => {
    const json = buildProjectJson({})
    delete JSON.parse(json).aiConfig
    // 直接构造不含 aiConfig 字段的 JSON
    const raw = JSON.parse(json) as Record<string, unknown>
    delete raw.aiConfig

    const parsed = parseProjectFile(JSON.stringify(raw))

    expect(parsed.aiConfig).toEqual(defaultProjectAIConfig())
    // legacy 标记：原文件不含 aiConfig 字段（迁移桥据此跳过）
    expect(parsed.hasAIConfig).toBe(false)
  })

  it('aiConfig 整体非对象（如 null） → 回退默认', () => {
    const parsed = parseProjectFile(buildProjectJson({ aiConfig: null }))
    expect(parsed.aiConfig).toEqual(defaultProjectAIConfig())
  })

  it('defaultConfig 缺字段 → 回退默认 defaultConfig，其余字段保留', () => {
    const badDefault = { localPrompt: 'x' } as unknown as AIConfig
    const aiConfig = {
      globalPrompt: '全局',
      defaultConfig: badDefault,
      nodeConfigs: [],
    }
    const parsed = parseProjectFile(buildProjectJson({ aiConfig }))

    expect(parsed.aiConfig.globalPrompt).toBe('全局')
    expect(parsed.aiConfig.defaultConfig).toEqual(defaultProjectAIConfig().defaultConfig)
    expect(parsed.aiConfig.nodeConfigs).toEqual([])
  })

  it('defaultConfig 类型错（mode 非法 / localPrompt 非字符串）→ 回退默认 defaultConfig', () => {
    const badDefault = {
      localPrompt: 123,
      mode: 'super',
      viewTextAlgoId: 'collectAll',
    }
    const aiConfig = {
      globalPrompt: '全局',
      defaultConfig: badDefault,
      nodeConfigs: [],
    }
    const parsed = parseProjectFile(buildProjectJson({ aiConfig }))

    expect(parsed.aiConfig.defaultConfig).toEqual(defaultProjectAIConfig().defaultConfig)
  })

  it('nodeConfigs 中 nodeId 不存在于节点集合 → 丢弃该条', () => {
    const aiConfig: ProjectAIConfigData = {
      globalPrompt: '',
      defaultConfig: defaultProjectAIConfig().defaultConfig,
      nodeConfigs: [
        { nodeId: 'ghost', config: validConfig() },
        { nodeId: 'child1', config: validConfig({ localPrompt: '保留' }) },
      ],
    }
    const parsed = parseProjectFile(buildProjectJson({ aiConfig }))

    expect(parsed.aiConfig.nodeConfigs).toEqual([
      { nodeId: 'child1', config: validConfig({ localPrompt: '保留' }) },
    ])
  })

  it('nodeConfigs 中 config 结构非法 → 丢弃该条', () => {
    const aiConfig: ProjectAIConfigData = {
      globalPrompt: '',
      defaultConfig: defaultProjectAIConfig().defaultConfig,
      nodeConfigs: [
        { nodeId: 'child1', config: { localPrompt: '缺字段' } as unknown as AIConfig },
        { nodeId: 'child1', config: validConfig({ localPrompt: '合法' }) },
      ],
    }
    const parsed = parseProjectFile(buildProjectJson({ aiConfig }))

    expect(parsed.aiConfig.nodeConfigs).toEqual([
      { nodeId: 'child1', config: validConfig({ localPrompt: '合法' }) },
    ])
  })

  it('nodeConfigs 非数组 → 回退空数组', () => {
    const aiConfig = {
      globalPrompt: '',
      defaultConfig: defaultProjectAIConfig().defaultConfig,
      nodeConfigs: 'not-array',
    }
    const parsed = parseProjectFile(buildProjectJson({ aiConfig }))

    expect(parsed.aiConfig.nodeConfigs).toEqual([])
  })

  it('globalPrompt 非字符串 → 回退空字符串', () => {
    const aiConfig = {
      globalPrompt: 123,
      defaultConfig: defaultProjectAIConfig().defaultConfig,
      nodeConfigs: [],
    }
    const parsed = parseProjectFile(buildProjectJson({ aiConfig }))

    expect(parsed.aiConfig.globalPrompt).toBe('')
  })
})