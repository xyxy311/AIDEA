# AI 功能

调用本地 Ollama 大模型（默认 `qwen2.5-coder:7b`），把「当前视图节点 + 连线」转为上下文发给模型。发散 / 连词成句的回复打印到控制台；**AI 生成词**在生成完成后经浮动面板（`FloatingAIWordPanel` / `FloatingAIWordStrip`）展示，点击词即可添加为节点。**当前尚未实现渲染到画布 / 采纳建议**。

## 核心概念

- **上下文双来源**：`buildNodeContext`（带连线，含 `# 设定` / `## 节点树` / `## 连线表`）与 `utils/viewText`（空间布局算法，无连线）。经 `buildAIContext` 按 `AIConfig.includeConnections` 分派。
- **提示词分层**：项目级全局提示词 `globalPrompt` + 节点级局部提示词 `localPrompt`，随 `AIConfig` 存于 `projectStore`。
- **快速 / 精确（二段式）**：精确模式先 `runAISentenceMaking` 把结构化上下文「连词成句」成自然语言，再以其执行任务；快速模式直接发结构化上下文。
- **面板**：左侧活动栏 `'ai'` 面板（`AIPanel`）集中配置提示词与模式，并预览转化后的上下文。

## 架构

```
                    ┌─ buildNodeContext()   带连线：# 设定 / ## 节点树 / ## 连线表
buildAIContext ────┤
  (双来源分派)      └─ buildViewText()      空间布局算法（VIEW_TEXT_ALGORITHMS 注册表）
         │
         ▼
assembleTaskMessages()  快速: user = globalPrompt + localPrompt + 上下文
         │              精确: user = globalPrompt + localPrompt + 连词成句结果
         ▼
provider/openai.ts（OpenAI 兼容 fetch）  ——  createOpenAIProvider(config)
         │  POST {baseURL}/chat/completions
         ▼
stores/ai.ts（连接参数，localStorage 持久化）
         │
         ▼
constants/ai.ts（AI_DEFAULT_CONFIG / AI_SYSTEM_PROMPT / AI_WORD_PROMPT / AI_SENTENCE_PROMPT）
```

## 相关文件

| 文件 | 职责 |
| --- | --- |
| `src/composables/useAIAssist.ts` | 编排入口。`buildNodeContext` / `buildAIContext` / `assembleTaskMessages` 为只读纯函数；`runAISentenceMaking` / `runAIAssist` / `runAIWordGeneration` 负责取目标节点、组 messages、调 provider、打印回复 |
| `src/utils/viewText.ts` | 空间布局文本算法注册表（rowCluster / lineHit / collectAll）+ `buildViewText` 调度器，作为「不带连线」上下文来源 |
| `src/types/ai.ts` | `AIConfig { localPrompt, includeConnections, mode, viewTextAlgoId }` |
| `src/stores/project.ts` | 项目级 AI 配置：`globalPrompt` / `defaultAIConfig` / `nodeAIConfigs: Map<nodeId, AIConfig>` / `getAIConfig`(未配置回退默认) / 各 setter（`markDataDirty` 标脏，不入 undo） |
| `src/provider/aiProvider.ts` | 纯类型：`ChatMessage` / `ChatOptions` / `AIProviderConfig` / `AIProvider` |
| `src/provider/openai.ts` | OpenAI 兼容实现：`createOpenAIProvider(config)` + `AIError` 分级错误类 |
| `src/stores/ai.ts` | `useAIConfigStore`：`baseURL` / `apiKey` / `model` / `timeoutMs` / `temperature`，`useStorage` 持久化 |
| `src/constants/ai.ts` | `AI_DEFAULT_CONFIG`、`AI_SYSTEM_PROMPT`（发散）、`AI_WORD_PROMPT`（词生成）、`AI_SENTENCE_PROMPT`（连词成句） |
| `src/utils/projectFile.ts` | 项目文件序列化/解析 `aiConfig` 字段（`globalPrompt` / `defaultConfig` / `nodeConfigs`），缺字段/悬空 nodeId 自愈 |
| `src/composables/useProjectFile.ts` | 新建/打开项目时收集与载入 AI 配置 |
| `src/components/panels/AIPanel.vue` | 左侧活动栏 AI 面板（替换原 ViewTextPanel） |
| `src/composables/useAIWordPanel.ts` | 共享状态单例：`show(words)` / `close` / `setMode` / `clear`，不运行 AI 生成 |
| `src/composables/useAIWordGenerate.ts` | `generateAndShowWords()` 编排「调用模型 → 拆行 → `show`」，供键盘 `I` 与面板入口使用 |
| `src/components/floating/FloatingAIWordPanel.vue` | AI 生成词浮动面板（panel 模式），只展示共享状态 + 添加/关闭 |
| `src/components/floating/FloatingAIWordStrip.vue` | AI 生成词底部小字条（strip 模式），只展示共享状态 + 清除 |
| `src/__tests__/provider/openai.test.ts` | provider 单测（mock fetch） |
| `src/__tests__/composables/useAIAssist.test.ts` | 编排函数单测（mock fetch） |
| `src/__tests__/utils/projectFile.test.ts` | 项目文件含 aiConfig 的序列化/解析自愈单测 |

## 上下文构建（双来源）

### buildNodeContext(nodeStore, targetNodeId, opts?)
带连线结构化版本。输出 `# [项目名]` → `# 设定`（收集路径与目标子级中出现的 @引用，递归输出被引用节点子树）→ `## 节点树`（根→目标路径缩进 + 目标直接子级带 `(N1)/(C1)` 编号）→ `## 连线表`（起点ID --[连线文字]--> 终点ID，按有向箭头）。`includeIds` 控制是否输出编号，`includeConnections` 控制是否输出连线表（依赖 includeIds）。

### buildViewText(nodes, algoId, params?)
空间布局版本（无连线）。`utils/viewText.ts` 注册表提供 rowCluster（y 重叠贪心聚行）/ lineHit（搜索线命中聚行）/ collectAll（扁平列表），面板与上下文共用同一注册表。

### buildAIContext(nodeStore, targetNodeId, aiConfig)
统一入口，纯函数：
- `aiConfig.includeConnections === true` → `buildNodeContext(...)`
- `false` → `buildViewText(childrenOf(targetNodeId), aiConfig.viewTextAlgoId ?? 'collectAll')`

## 提示词与模式（AIConfig）

`AIConfig`（`src/types/ai.ts`）：
- `localPrompt`：局部提示词，跟随观察节点
- `includeConnections`：是否携带连线（决定上下文来源）
- `mode: 'fast' | 'precise'`：快速 / 精确（精确 = 先连词成句）
- `viewTextAlgoId`：`includeConnections=false` 时选用的 viewText 算法 id

存于 `projectStore`（项目级，随项目文件 `aiConfig` 字段序列化，`markDataDirty` 标脏不入 undo）：
- `globalPrompt`：全局提示词，为所有节点提供项目背景
- `defaultAIConfig`：全局默认配置
- `nodeAIConfigs: Map<nodeId, AIConfig>`：按节点覆盖；`getAIConfig(nodeId)` 未配置时回退 `defaultAIConfig`

写入口：`setGlobalPrompt` / `setDefaultAIConfig` / `setNodeAIConfig(nodeId, cfg)` / `clearNodeAIConfig(nodeId)`。连接参数（baseURL / model 等）在独立 `stores/ai.ts`（localStorage），与项目级提示词配置分离。

## 工作流

### assembleTaskMessages(nodeStore, targetNodeId, aiConfig, taskSystemPrompt, precomputedUserContent?)
纯函数，组装 `[system(任务提示词), user(内容)]`：
- 未传 `precomputedUserContent`：`user = globalPrompt + localPrompt + buildAIContext(...)`（非空白部分拼接）
- 传入：直接作为 user 内容（精确模式由外层已拼好 global/local）

### runAISentenceMaking(structuredContext)
二段式第一步。以 `AI_SENTENCE_PROMPT` 为 system、结构化上下文为 user，把节点/连线转自然语言描述。供面板预览与精确模式使用。

### runAIAssist(targetNodeId?) —— 发散
- 取目标节点（默认 `project.currentNodeId`）→ `cfg = project.getAIConfig(targetId)`
- `fast`：`assembleTaskMessages(..., AI_SYSTEM_PROMPT)` 直接发结构化上下文
- `precise`：先 `runAISentenceMaking(buildAIContext(...))` 连词成句，再以自然语言组装任务消息
- `console.log('[AI 回复]', reply)`，返回回复文本

### runAIWordGeneration(targetNodeId?) —— 生成 10 个词
- 同上读取 `cfg`，`system(AI_WORD_PROMPT)`，返回换行分隔的 10 个词（无序号）
- 精确模式同样先连词成句
- 本身只返回文本并打印到控制台；展示到浮动面板由下文「AI 生成词浮动面板」的编排完成

## AI 生成词浮动面板

「生成词」在生成完成后注入共享状态、经浮动面板展示（点击词可添加为节点），数据流如下：

```
AIPanel「生成词」按钮 / 键盘 I
        │  runAIWordGeneration() → 按换行拆词
        ▼
useAIWordPanel().show(words)   ← 同步注入共享状态 + 打开面板
        │  共享 reactive 单例（visible / error / words / displayMode）
        ▼
FloatingAIWordPanel / FloatingAIWordStrip   只读展示 + 添加/关闭
```

- **`useAIWordPanel`**（`src/composables/useAIWordPanel.ts`）：纯共享状态单例，**不运行 AI 生成**。状态 `visible / error / words / displayMode`；动作 `show(words)`（同步，调用方在生成完成后传入结果并打开面板）、`close`、`setMode`（strip/panel 切换）、`clear`。已移除 loading，生成进度由调用方自行管理。
- **`FloatingAIWordPanel` / `FloatingAIWordStrip`**：只读取共享状态展示内容 + 添加/关闭，不调用 AI 生成逻辑。按 `displayMode` 二选一挂在 `AppShell`。
- **`useAIWordGenerate`**（`src/composables/useAIWordGenerate.ts`）：`generateAndShowWords()` 编排「调用 `runAIWordGeneration` → 按换行拆词 → `show(words)`」，供键盘快捷键 `I` 触发。
- **入口**：AIPanel「生成词」按钮（生成完成后调用 `show`）与键盘 `I`。工具栏中的 AI 生成按钮已移除；strip/panel 展示模式切换仍保留在工具栏。

## 面板（AIPanel）

左侧活动栏 `'ai'` 面板（替换原 ViewTextPanel，`constants/panels.ts` 中 `viewText`→`ai`）：
- **全局提示词** textarea（经 `setGlobalPrompt` 写入，触发 dirty）
- **当前视图设置**：局部提示词 / 是否携带连线 switch / 处理模式(快速·精确) / （不带连线时）空间布局算法下拉；本地可编辑副本，经「保存」提交 `setNodeAIConfig(currentNodeId, ...)`，「恢复默认」调 `clearNodeAIConfig`
- **上下文预览**：`buildAIContext` 实时生成，只读 + 复制
- **精确模式**额外「连词成句」按钮：`runAISentenceMaking` 结果展示 + 复制
- **底部操作**：「发散当前视图」(`runAIAssist`，结果打印到控制台) / 「生成词」(`runAIWordGeneration`，生成完成后调用 `useAIWordPanel().show(words)` 唤醒浮动面板展示)

## 使用方法

浏览器控制台调用（或经 AI 面板按钮）：

```js
runAIAssist()          // 发散当前视图（按 AIConfig 走快速/精确，结果打印到控制台）
runAIWordGeneration()  // 返回换行分隔的 10 个词（仅返回文本/打印）
runAISentenceMaking(structuredContext)  // 连词成句（二段式第一步）
```

日常使用「生成词」建议走 **AIPanel「生成词」按钮** 或键盘 **`I`**：它们会在生成完成后调用 `useAIWordPanel().show(words)`，把词展示到浮动面板并可直接点击添加为节点。

## 配置

- **项目级**（`projectStore`，随项目文件序列化）：`globalPrompt` + `defaultAIConfig` + `nodeAIConfigs`，经 AI 面板编辑。
- **连接参数**（`useAIConfigStore`，localStorage `aidea-ai-config-*`）：`baseURL: 'http://localhost:11434/v1'`（Ollama 兼容端点）、`model: 'qwen2.5-coder:7b'`、`timeoutMs: 60000`、`temperature: 0.7`、`apiKey` 默认空（本地模型无需 key）。

## 健壮性

- 超时：AbortController + 定时器（默认 60s），与外部 signal 合并
- 网络错误：自动重试 1 次（约 500ms 退避）
- 错误分级：`AIError.type` —— `timeout` / `network` / `auth`（401/403）/ `http` / `parse` / `not-implemented`（stream 预留）
- 上下文为空：warn 后返回空字符串，不发起请求

## 边界与后续

- 当前只打印到控制台，不渲染；后续采纳流程（parse.ts / suggestStore / 新节点）未实现
- 项目顾问（评价/建议）未实现；架构已预留 —— `assembleTaskMessages` 可传任意任务 system prompt，新增 `AI_EVALUATE_PROMPT` + 面板按钮即可扩展
- `stream` 分支已预留接口但未实现，命中即抛 `not-implemented`
- apiKey 存 localStorage 仅适用于本地模型 / 自用；正式发布可加薄后端代理，因 `baseURL` 可配，仅需指向代理，`AIProvider` 接口不变