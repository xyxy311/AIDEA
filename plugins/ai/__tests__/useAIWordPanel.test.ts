import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import {
  useAIWordPanel,
  directGenerate,
  regenerate,
  sentenceMaking,
  setAIMode,
  generateDirectional,
} from '../composables/useAIWordPanel'
import { currentViewedNodeId, getAIConfig, setDefaultAIConfig } from '../stores/aiProject'
import { AI_SENTENCE_PROMPT, AI_GENERATE_IDEA_NODE, AI_GENERATE_IDEA_DESCRIPTION, AI_DIRECTION_ANY, AI_DIRECTION_FOCUS } from '../constants'
import type { AIConfig, AIDivergenceDirection } from '../types'

// 用 vi.hoisted Mock 插件内 useAIDirectionsStore，隔离真实持久化，聚焦默认发散方向接线
const dirMocks = vi.hoisted(() => ({
  getDefaultDirection: vi.fn(),
}))

vi.mock('../stores/aiDirections', () => ({
  useAIDirectionsStore: () => ({
    getDefaultDirection: dirMocks.getDefaultDirection,
  }),
}))

/** 测试用默认方向（非任意发散，便于断言 directGenerate/regenerate 使用了 store 默认方向） */
const MOCK_DIRECTION: AIDivergenceDirection = {
  id: 'mock-default',
  title: '默认方向',
  prompt: '请基于默认方向发散灵感。',
  separator: ' ',
}

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
  // 显隐已迁浮动层运行时（floating.open/close 收短 id 'words'）：open 前 fail-fast 查
  // uiRegistry 登记表——真实运行时 setup 已注册，此处对齐登记 ai:words 条目（幂等）
  const registry = useUiRegistryStore()
  if (!registry.floatingLayers.has('ai:words')) {
    registry.registerPluginFloatingLayer('ai', {
      id: 'words',
      component: defineComponent(() => () => h('div')),
    })
  }
}

describe('useAIWordPanel - directGenerate（无参，I 键与 AIPanel 共用）', () => {
  let nodeStore: ReturnType<typeof useNodeStore>
  let project: ReturnType<typeof useProjectStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    nodeStore = useNodeStore()
    project = useProjectStore()
    resetState()
    dirMocks.getDefaultDirection.mockReturnValue(MOCK_DIRECTION)
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
    setDefaultAIConfig(cfg({ localPrompt: '局部见解', mode: 'fast' }))

    const words = await directGenerate()

    expect(words).toEqual(['词一', '词二', '词三'])
    const panel = useAIWordPanel()
    expect(panel.words.value).toEqual(['词一', '词二', '词三'])
    expect(panel.visible.value).toBe(true)
    expect(panel.error.value).toBeNull()
    // 自动生成的上下文预览回填（标题 = 祖先链「根节点/.../当前视图节点」，即 项目/目标）
    expect(panel.previewText.value).toContain('子A')
    expect(panel.previewText.value).toContain('项目/目标 :\n')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_GENERATE_IDEA_NODE)
    expect(body.messages[1].content).toContain('子A')
    expect(body.messages[1].content).toContain('子B')
    expect(body.messages[1].content).toContain('局部见解')
    expect(body.messages[1].content).toContain('# 指令')
    expect(body.messages[1].content).toContain(MOCK_DIRECTION.prompt) // 直接生成用 store 默认方向
    expect(body.messages[1].content).not.toContain('副标题A')
  })

  it('当前视图无子节点但有祖先链：仍能生成预览并直接发散', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('灵感1\n灵感2'))
    vi.stubGlobal('fetch', fetchMock)

    nodeStore.getNode(ROOT_NODE_ID)!.text = '项目'
    const parent = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '一级')
    const target = nodeStore.addNode(parent, 0, 0, '二级') // 空视图：无子节点
    project.switchView(target)
    setDefaultAIConfig(cfg({ localPrompt: '', mode: 'fast' }))

    const words = await directGenerate()

    expect(words).toEqual(['灵感1', '灵感2'])
    const panel = useAIWordPanel()
    // 预览 = 祖先链「根/直接父级/当前视图」，含当前视图节点本身
    expect(panel.previewText.value).toBe('项目/一级/二级')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[1].content).toContain('项目/一级/二级')
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
    setDefaultAIConfig(cfg({ mode: 'precise' }))

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
    expect(secondBody.messages[0].content).toBe(AI_GENERATE_IDEA_DESCRIPTION)
    expect(secondBody.messages[1].content).toContain('目标下有两个子主题。')
  })

  it('精确模式：已存在连词成句结果时直接复用，不再连词成句', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('结果词'))
    vi.stubGlobal('fetch', fetchMock)

    setDefaultAIConfig(cfg({ mode: 'precise' }))
    const panel = useAIWordPanel()
    panel.previewText.value = '用户已编辑的预览'
    panel.sentenceText.value = '用户已编辑的句子'

    const words = await directGenerate()

    expect(words).toEqual(['结果词'])
    expect(fetchMock).toHaveBeenCalledTimes(1) // 不重复连词成句
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_GENERATE_IDEA_DESCRIPTION)
    expect(body.messages[1].content).toContain('用户已编辑的句子')
  })

  it('上下文为空：返回空数组，不调用 fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    nodeStore.getNode(ROOT_NODE_ID)!.text = '' // 根节点无名称 → 标题为空的真·空上下文
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
    dirMocks.getDefaultDirection.mockReturnValue(MOCK_DIRECTION)
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
    setDefaultAIConfig(cfg({ mode: 'fast' }))

    const panel = useAIWordPanel()
    panel.previewText.value = '会被覆盖的旧预览'

    const words = await regenerate()

    expect(words).toEqual(['新词'])
    expect(panel.previewText.value).toContain('子1') // 被重算覆盖
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_GENERATE_IDEA_NODE)
    // 重新生成也用 store 默认方向
    expect(body.messages[1].content).toContain('# 指令')
    expect(body.messages[1].content).toContain(MOCK_DIRECTION.prompt)
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

  it('setAIMode：更新内部 mode 并写回项目级 additions 配置', () => {
    setAIMode('precise')

    expect(useAIWordPanel().mode.value).toBe('precise')
    expect(getAIConfig(currentViewedNodeId()).mode).toBe('precise')
  })
})

describe('useAIWordPanel - generateDirectional（定向发散）', () => {
  let nodeStore: ReturnType<typeof useNodeStore>
  let project: ReturnType<typeof useProjectStore>

  /** 构造一个发散方向（prompt 内嵌 ${from}） */
  function dir(overrides: Partial<AIDivergenceDirection> = {}): AIDivergenceDirection {
    return {
      id: 'why',
      title: '为什么？',
      prompt: '围绕「${from}」从「为什么？」的角度展开深入追问。',
      ...overrides,
    }
  }

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

  it('fast 模式：system 用 AI_GENERATE_IDEA_NODE，user 含 # 上下文/# 指令/# 补充 与 from、body 上下文，返回拆行词并 show', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('为什么词1\n为什么词2'))
    vi.stubGlobal('fetch', fetchMock)

    nodeStore.getNode(ROOT_NODE_ID)!.text = '项目'
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子A')
    project.switchView(target)
    setDefaultAIConfig(cfg({ localPrompt: '局部见解', mode: 'fast' }))

    const direction = dir()
    const words = await generateDirectional(['选中起点'], direction)

    expect(words).toEqual(['为什么词1', '为什么词2'])
    const panel = useAIWordPanel()
    expect(panel.words.value).toEqual(['为什么词1', '为什么词2'])
    expect(panel.visible.value).toBe(true)
    expect(panel.error.value).toBeNull()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_GENERATE_IDEA_NODE)
    const user = body.messages[1].content as string
    expect(user).toContain('# 上下文')
    expect(user).toContain('子A') // body 上下文
    expect(user).toContain('# 指令')
    // 方向 prompt 含 ${from}，from 被替换为 fromText
    expect(user).toContain('围绕「选中起点」从「为什么？」的角度展开深入追问。')
    expect(user).not.toContain('${from}')
    expect(user).toContain('# 补充')
    expect(user).toContain('局部见解') // global/local 提示词
  })

  it('precise 模式：先连词成句（两次 fetch），再传入 direction 定向发散', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse('目标下有两个子主题。'))
      .mockResolvedValueOnce(okResponse('定向词1\n定向词2'))
    vi.stubGlobal('fetch', fetchMock)

    nodeStore.getNode(ROOT_NODE_ID)!.text = '项目'
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')
    project.switchView(target)
    setDefaultAIConfig(cfg({ mode: 'precise' }))

    const direction = dir()
    const words = await generateDirectional(['选中起点'], direction)

    expect(words).toEqual(['定向词1', '定向词2'])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [, firstInit] = fetchMock.mock.calls[0]
    const firstBody = JSON.parse(firstInit.body as string)
    expect(firstBody.messages[0].content).toBe(AI_SENTENCE_PROMPT)

    const panel = useAIWordPanel()
    expect(panel.sentenceText.value).toContain('目标下有两个子主题。')

    const [, secondInit] = fetchMock.mock.calls[1]
    const secondBody = JSON.parse(secondInit.body as string)
    expect(secondBody.messages[0].content).toBe(AI_GENERATE_IDEA_DESCRIPTION)
    expect(secondBody.messages[1].content).toContain('目标下有两个子主题。') // body 用连词成句结果
    expect(secondBody.messages[1].content).toContain('围绕「选中起点」从「为什么？」的角度展开深入追问。')
  })

  it('generateDirectional(AI_DIRECTION_FOCUS)：围绕 fromText 聚焦发散', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('词1\n词2'))
    vi.stubGlobal('fetch', fetchMock)

    nodeStore.getNode(ROOT_NODE_ID)!.text = '项目'
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')
    project.switchView(target)
    setDefaultAIConfig(cfg({ mode: 'fast' }))

    const words = await generateDirectional(['选中起点'], AI_DIRECTION_FOCUS)

    expect(words).toEqual(['词1', '词2'])
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_GENERATE_IDEA_NODE)
    expect(body.messages[1].content).toContain('请围绕「选中起点」发散灵感，生成一些能帮助用户思考的灵感词或短句。')
  })

  it('direction 无 ${from}（如任意发散）：from 被忽略，不注入起点', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('词1\n词2'))
    vi.stubGlobal('fetch', fetchMock)

    nodeStore.getNode(ROOT_NODE_ID)!.text = '项目'
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')
    project.switchView(target)
    setDefaultAIConfig(cfg({ mode: 'fast' }))

    const words = await generateDirectional(['选中起点'], AI_DIRECTION_ANY)

    expect(words).toEqual(['词1', '词2'])
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[0].content).toBe(AI_GENERATE_IDEA_NODE)
    expect(body.messages[1].content).toContain(AI_DIRECTION_ANY.prompt)
    expect(body.messages[1].content).not.toContain('选中起点')
    expect(body.messages[1].content).not.toContain('发散起点')
  })

  it('from 为空但仍能发散（body 非空）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('词1\n词2'))
    vi.stubGlobal('fetch', fetchMock)

    nodeStore.getNode(ROOT_NODE_ID)!.text = '项目'
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')
    project.switchView(target)
    setDefaultAIConfig(cfg({ mode: 'fast' }))

    const words = await generateDirectional([], dir())

    expect(words).toEqual(['词1', '词2'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.messages[1].content).toContain('子1') // 仅 body 上下文
    expect(body.messages[1].content).not.toContain('发散起点')
  })

  it('from 为空且 body 为空：返回空数组，不调用 fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    nodeStore.getNode(ROOT_NODE_ID)!.text = '' // 根节点无名称 → 标题为空的真·空上下文
    const words = await generateDirectional([], dir())

    expect(words).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('调用失败：内部捕获异常置 error，不抛出', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    nodeStore.getNode(ROOT_NODE_ID)!.text = '项目'
    const target = nodeStore.addNode(ROOT_NODE_ID, 0, 0, '目标')
    nodeStore.addNode(target, 0, 0, '子1')
    project.switchView(target)
    setDefaultAIConfig(cfg({ mode: 'fast' }))

    const words = await generateDirectional(['选中起点'], dir())

    expect(words).toEqual([])
    expect(useAIWordPanel().error.value).toBeTruthy()
  })
})
