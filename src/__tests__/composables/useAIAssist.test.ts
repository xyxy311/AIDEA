import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useAIConfigStore } from '@/stores/ai'
import {
  runAIAssist,
  runAIWordGeneration,
  runAISentenceMaking,
  buildAIContext,
  assembleTaskMessages,
} from '@/composables/useAIAssist'
import { AI_SENTENCE_PROMPT } from '@/constants/ai'
import type { AIConfig } from '@/types'

/** 构造 OpenAI 兼容成功响应 */
function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('runAIAssist', () => {
  let nodeStore: ReturnType<typeof useNodeStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    nodeStore = useNodeStore()
    nodeStore.getNode(ROOT_NODE_ID)!.text = '我的项目'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('成功调用：system + user（含节点文本）两段消息，打印并返回回复', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('发散建议'))
    vi.stubGlobal('fetch', fetchMock)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // 构造节点树：根 → 目标(含子级)
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '头脑主题')
    nodeStore.addNode(target, 0, 0, '子想法')

    const reply = await runAIAssist(target)

    expect(reply).toBe('发散建议')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    const body = JSON.parse(init.body as string)
    expect(body.messages.length).toBe(2)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1].role).toBe('user')
    expect(body.messages[1].content).toContain('头脑主题')
    expect(body.messages[1].content).toContain('子想法')

    // console.log 打印了回复
    expect(logSpy).toHaveBeenCalledWith('[AI 回复]', '发散建议')
  })

  it('缺省 targetNodeId 时用当前查看节点（project.currentNodeId）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '默认目标')

    // 未传 targetNodeId → 使用 project.currentNodeId（主视图 viewedNodeId）
    await runAIAssist()

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[1].content).toContain('默认目标')
  })

  it('调用失败时打印错误并 re-throw', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '主题')

    await expect(runAIAssist(target)).rejects.toBeInstanceOf(Error)
    expect(errorSpy).toHaveBeenCalledWith('[AI 调用失败]', expect.any(Error))
  })

  it('上下文为空时空字符串并打印警告，不调用 fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const reply = await runAIAssist('not-exist')

    expect(reply).toBe('')
    expect(warnSpy).toHaveBeenCalledWith('[AI] 当前视图上下文为空')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ===================================================================
// buildAIContext - 按 aiConfig 分派上下文构建
// ===================================================================
describe('buildAIContext', () => {
  let nodeStore: ReturnType<typeof useNodeStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    nodeStore = useNodeStore()
    nodeStore.getNode(ROOT_NODE_ID)!.text = '我的项目'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('includeConnections=true → 输出 buildNodeContext 结构化版本（含连线表）', () => {
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    const c1 = nodeStore.addNode(target, 0, 0, '子1')
    const c2 = nodeStore.addNode(target, 0, 0, '子2')
    nodeStore.addConnection(target, c1, c2)
    const connId = nodeStore.getConnections(target)[0].id
    nodeStore.updateConnection(target, connId, { directed: true, text: '导致' })

    const cfg: AIConfig = {
      localPrompt: '',
      includeConnections: true,
      mode: 'fast',
      viewTextAlgoId: 'collectAll',
    }

    const output = buildAIContext(nodeStore, target, cfg)

    expect(output).toContain('## 节点树')
    expect(output).toContain('目标 (N1)')
    expect(output).toContain('## 连线表')
    expect(output).toContain('C1 --[导致]--> C2')
  })

  it('includeConnections=false → viewText 空间布局，collectAll 逐节点一行含首行文本', () => {
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子A\n副标题A')
    nodeStore.addNode(target, 100, 0, '子B')

    const cfg: AIConfig = {
      localPrompt: '',
      includeConnections: false,
      mode: 'fast',
      viewTextAlgoId: 'collectAll',
    }

    const output = buildAIContext(nodeStore, target, cfg)

    // collectAll：按 childrenOf 顺序逐节点一行，取首行
    expect(output).toBe('子A\n子B')
    expect(output).not.toContain('副标题A')
    expect(output).not.toContain('节点树')
  })
})

// ===================================================================
// assembleTaskMessages - 任务消息组装
// ===================================================================
describe('assembleTaskMessages', () => {
  let nodeStore: ReturnType<typeof useNodeStore>
  let project: ReturnType<typeof useProjectStore>

  const taskPrompt = '任务系统提示词'

  beforeEach(() => {
    setActivePinia(createPinia())
    nodeStore = useNodeStore()
    project = useProjectStore()
    nodeStore.getNode(ROOT_NODE_ID)!.text = '我的项目'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fast 模式无 precomputed → [system(任务提示词), user(global+local+context)]', () => {
    project.setGlobalPrompt('全局提示')
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')

    const cfg: AIConfig = {
      localPrompt: '局部提示',
      includeConnections: true,
      mode: 'fast',
      viewTextAlgoId: 'collectAll',
    }

    const messages = assembleTaskMessages(nodeStore, target, cfg, taskPrompt)

    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({ role: 'system', content: taskPrompt })
    expect(messages[1].role).toBe('user')
    const user = messages[1].content
    expect(user).toContain('全局提示')
    expect(user).toContain('局部提示')
    // 上下文（buildAIContext 结构化）也在 user 中
    expect(user).toContain('目标 (N1)')
    expect(user).toContain('子1 (C1)')
  })

  it('传入 precomputedUserContent → user 直接为该内容（不重复拼 global/local）', () => {
    project.setGlobalPrompt('全局提示')
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')

    const cfg: AIConfig = {
      localPrompt: '局部提示',
      includeConnections: true,
      mode: 'fast',
      viewTextAlgoId: 'collectAll',
    }

    const messages = assembleTaskMessages(nodeStore, target, cfg, taskPrompt, '已连词成句的自然语言')

    expect(messages[1].content).toBe('已连词成句的自然语言')
    expect(messages[1].content).not.toContain('全局提示')
    expect(messages[1].content).not.toContain('局部提示')
  })

  it('全局/局部提示词为空 → user 仅上下文本体，不额外拼接或产生前导/尾随空行', () => {
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')

    const cfg: AIConfig = {
      localPrompt: '',
      includeConnections: true,
      mode: 'fast',
      viewTextAlgoId: 'collectAll',
    }

    const messages = assembleTaskMessages(nodeStore, target, cfg, taskPrompt)
    const body = buildAIContext(nodeStore, target, cfg)

    const user = messages[1].content
    // 无全局/局部前缀，user 即上下文本体（trim 后），无前导/尾随换行
    expect(user).toBe(body.trim())
    expect(user.startsWith('\n')).toBe(false)
    expect(user.endsWith('\n')).toBe(false)
    expect(user).toContain('目标 (N1)')
  })
})

// ===================================================================
// runAISentenceMaking - 连词成句（二段式第一段）
// ===================================================================
describe('runAISentenceMaking', () => {
  let nodeStore: ReturnType<typeof useNodeStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    nodeStore = useNodeStore()
    nodeStore.getNode(ROOT_NODE_ID)!.text = '我的项目'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('用 AI_SENTENCE_PROMPT 作为 system，返回自然语言描述', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('目标包含两个子主题，它们相互关联。'))
    vi.stubGlobal('fetch', fetchMock)

    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')

    const cfg: AIConfig = {
      localPrompt: '',
      includeConnections: true,
      mode: 'fast',
      viewTextAlgoId: 'collectAll',
    }
    const structured = buildAIContext(nodeStore, target, cfg)

    const reply = await runAISentenceMaking(structured)

    expect(reply).toBe('目标包含两个子主题，它们相互关联。')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_SENTENCE_PROMPT)
    expect(body.messages[1].content).toBe(structured)
  })
})

// ===================================================================
// runAIAssist / runAIWordGeneration - 精确模式二段式
// ===================================================================
describe('精确模式二段式编排', () => {
  let nodeStore: ReturnType<typeof useNodeStore>
  let project: ReturnType<typeof useProjectStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    nodeStore = useNodeStore()
    project = useProjectStore()
    nodeStore.getNode(ROOT_NODE_ID)!.text = '我的项目'
    // 置为精确模式（二段式）
    project.setDefaultAIConfig({
      localPrompt: '局部提示',
      includeConnections: true,
      mode: 'precise',
      viewTextAlgoId: 'collectAll',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('runAIAssist：precise 模式先连词成句再发散，chat 被调用两次，最终 user 含连词成句结果', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse('目标与子1、子2密切相关。'))
      .mockResolvedValueOnce(okResponse('发散建议'))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')
    nodeStore.addNode(target, 0, 0, '子2')

    const reply = await runAIAssist(target)

    expect(reply).toBe('发散建议')
    // 两次调用：连词成句 + 最终发散
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // 第一次调用：连词成句（system = AI_SENTENCE_PROMPT）
    const [, firstInit] = fetchMock.mock.calls[0]
    const firstBody = JSON.parse(firstInit.body as string)
    expect(firstBody.messages[0].content).toBe(AI_SENTENCE_PROMPT)

    // 第二次调用：最终任务消息，user 含连词成句结果 + 全局/局部提示词
    const [, secondInit] = fetchMock.mock.calls[1]
    const secondBody = JSON.parse(secondInit.body as string)
    expect(secondBody.messages[0].role).toBe('system')
    expect(secondBody.messages[1].content).toContain('目标与子1、子2密切相关。')
    expect(secondBody.messages[1].content).toContain('局部提示')
  })

  it('runAIWordGeneration：precise 模式同样二段式，chat 被调用两次，最终 user 含连词成句结果', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse('目标与子1、子2密切相关。'))
      .mockResolvedValueOnce(okResponse('灵感词1\n灵感词2'))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')

    const reply = await runAIWordGeneration(target)

    expect(reply).toBe('灵感词1\n灵感词2')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [, firstInit] = fetchMock.mock.calls[0]
    const firstBody = JSON.parse(firstInit.body as string)
    expect(firstBody.messages[0].content).toBe(AI_SENTENCE_PROMPT)

    const [, secondInit] = fetchMock.mock.calls[1]
    const secondBody = JSON.parse(secondInit.body as string)
    expect(secondBody.messages[1].content).toContain('目标与子1、子2密切相关。')
  })

  it('runAIWordGeneration：fast 模式只调用一次，直接发结构化上下文', async () => {
    project.setDefaultAIConfig({
      localPrompt: '',
      includeConnections: true,
      mode: 'fast',
      viewTextAlgoId: 'collectAll',
    })
    const fetchMock = vi.fn().mockResolvedValue(okResponse('词A\n词B'))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')

    const reply = await runAIWordGeneration(target)

    expect(reply).toBe('词A\n词B')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[1].content).toContain('目标 (N1)')
    expect(body.messages[1].content).toContain('子1 (C1)')
  })
})