import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import {
  useAIWordPanel,
  directGenerate,
  regenerate,
  sentenceMaking,
  setAIMode,
} from '@/composables/useAIWordPanel'
import { AI_SENTENCE_PROMPT, AI_WORD_PROMPT } from '@/constants/ai'
import type { AIConfig } from '@/types'

/** 构造 OpenAI 兼容成功响应 */
function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 构造一个 AI 配置 */
function cfg(overrides: Partial<AIConfig> = {}): AIConfig {
  return { localPrompt: '', mode: 'fast', viewTextAlgoId: 'collectAll', ...overrides }
}

/** 重置模块级单例状态（testing 用） */
function resetState(): void {
  const p = useAIWordPanel()
  p.clear()
  p.previewText.value = ''
  p.sentenceText.value = ''
  p.mode.value = 'fast'
  p.generating.value = false
  p.regenerating.value = false
  p.sentenceLoading.value = false
}

describe('useAIWordPanel - directGenerate（无参，I 键与 AIPanel 共用）', () => {
  let nodeStore: ReturnType<typeof useNodeStore>
  let project: ReturnType<typeof useProjectStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    nodeStore = useNodeStore()
    project = useProjectStore()
    resetState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('预览为空时自动生成上下文预览，fast 直接发散，返回拆行词并 show', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('词一\n词二\n词三'))
    vi.stubGlobal('fetch', fetchMock)

    nodeStore.getNode(ROOT_NODE_ID)!.text = '项目'
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子A\n副标题A')
    nodeStore.addNode(target, 100, 0, '子B')
    project.switchView(target)
    project.setDefaultAIConfig(cfg({ localPrompt: '局部见解', mode: 'fast' }))

    const words = await directGenerate()

    expect(words).toEqual(['词一', '词二', '词三'])
    const panel = useAIWordPanel()
    expect(panel.words.value).toEqual(['词一', '词二', '词三'])
    expect(panel.visible.value).toBe(true)
    expect(panel.error.value).toBeNull()
    // 自动生成的上下文预览回填
    expect(panel.previewText.value).toContain('子A')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_WORD_PROMPT)
    expect(body.messages[1].content).toContain('子A')
    expect(body.messages[1].content).toContain('子B')
    expect(body.messages[1].content).toContain('局部见解')
    expect(body.messages[1].content).not.toContain('副标题A')
  })

  it('精确模式：预览为空自动生成预览，再自动连词成句，共两次调用', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse('目标下有两个子主题。'))
      .mockResolvedValueOnce(okResponse('灵感词1\n灵感词2'))
    vi.stubGlobal('fetch', fetchMock)

    nodeStore.getNode(ROOT_NODE_ID)!.text = '项目'
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')
    nodeStore.addNode(target, 0, 0, '子2')
    project.switchView(target)
    project.setDefaultAIConfig(cfg({ mode: 'precise' }))

    const words = await directGenerate()

    expect(words).toEqual(['灵感词1', '灵感词2'])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [, firstInit] = fetchMock.mock.calls[0]
    const firstBody = JSON.parse(firstInit.body as string)
    expect(firstBody.messages[0].content).toBe(AI_SENTENCE_PROMPT)

    const panel = useAIWordPanel()
    expect(panel.sentenceText.value).toContain('目标下有两个子主题。')

    const [, secondInit] = fetchMock.mock.calls[1]
    const secondBody = JSON.parse(secondInit.body as string)
    expect(secondBody.messages[0].content).toBe(AI_WORD_PROMPT)
    expect(secondBody.messages[1].content).toContain('目标下有两个子主题。')
  })

  it('精确模式：已存在连词成句结果时直接复用，不再连词成句', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('结果词'))
    vi.stubGlobal('fetch', fetchMock)

    project.setDefaultAIConfig(cfg({ mode: 'precise' }))
    const panel = useAIWordPanel()
    panel.previewText.value = '用户已编辑的预览'
    panel.sentenceText.value = '用户已编辑的句子'

    const words = await directGenerate()

    expect(words).toEqual(['结果词'])
    expect(fetchMock).toHaveBeenCalledTimes(1) // 不重复连词成句
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_WORD_PROMPT)
    expect(body.messages[1].content).toContain('用户已编辑的句子')
  })

  it('上下文为空：返回空数组，不调用 fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const words = await directGenerate()

    expect(words).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('调用失败：内部捕获异常置 error，不抛出', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')
    project.switchView(target)

    const words = await directGenerate()
    expect(words).toEqual([])
    expect(useAIWordPanel().error.value).toBeTruthy()
  })
})

describe('useAIWordPanel - regenerate（无参）', () => {
  let nodeStore: ReturnType<typeof useNodeStore>
  let project: ReturnType<typeof useProjectStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    nodeStore = useNodeStore()
    project = useProjectStore()
    resetState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('强制重算预览并发散（fast）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('新词'))
    vi.stubGlobal('fetch', fetchMock)

    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')
    project.switchView(target)
    project.setDefaultAIConfig(cfg({ mode: 'fast' }))

    const panel = useAIWordPanel()
    panel.previewText.value = '会被覆盖的旧预览'

    const words = await regenerate()

    expect(words).toEqual(['新词'])
    expect(panel.previewText.value).toContain('子1') // 被重算覆盖
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_WORD_PROMPT)
  })
})

describe('useAIWordPanel - sentenceMaking / setAIMode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sentenceMaking：预览为空自动生成预览，结果写回 sentenceText', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('一段自然语言。'))
    vi.stubGlobal('fetch', fetchMock)

    const nodeStore = useNodeStore()
    const project = useProjectStore()
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')
    project.switchView(target)

    const reply = await sentenceMaking()

    expect(reply).toBe('一段自然语言。')
    const panel = useAIWordPanel()
    expect(panel.sentenceText.value).toBe('一段自然语言。')
    expect(panel.previewText.value).toContain('子1')
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_SENTENCE_PROMPT)
  })

  it('setAIMode：更新内部 mode 并写回 project', () => {
    const project = useProjectStore()
    setAIMode('precise')

    expect(useAIWordPanel().mode.value).toBe('precise')
    expect(project.getAIConfig(project.currentNodeId).mode).toBe('precise')
  })
})