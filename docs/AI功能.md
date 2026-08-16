# AI 功能

调用本地 Ollama 大模型，把「当前视图节点」经 `viewText` 空间布局算法转为上下文文本发给模型。**直接生成 / 重新生成**的回复在生成完成后经浮动面板（`FloatingAIWordPanel` / `FloatingAIWordStrip`）展示，点击词即可添加为节点。**当前尚未实现渲染到画布 / 采纳建议**。

> 文档与代码同步更新于架构精简后：AI 生成逻辑收敛为「纯调用层 `useAIGenerate` → 状态编排层 `useAIWordPanel` → 展示触发层（`AIPanel` / 快捷键）」。

## 核心概念

- **纯文本调用**：`useAIGenerate` 只做「加载对应提示词 → 调模型 → 返回原始文本」，输入输出均为纯文本，不做任何格式转化。
- **两种工作逻辑**（`useAIGenerate`）：
  - `runSentenceMaking(text)`：连词成句（`AI_SENTENCE_PROMPT`），把上下文转自然语言。
  - `runGenerateIdea(text)`：发散 / 词生成（`AI_WORD_PROMPT`），基于给定文本发散灵感返回每行一词。
- **状态与编排上移**：`useAIWordPanel` 是模块级单例，管理 AI 模式（快速/精确）、预览框、连词成句结果、loading / error 与面板展示状态，并提供**无参**生成方法。
- **无参入口**：`directGenerate()` / `regenerate()` 由 `AIPanel` 与键盘 `I` 共用，不需要传参；预览为空时自动先生成上下文预览。
- **提示词分层**：项目级全局提示词 `globalPrompt` + 节点级局部提示词 `localPrompt`，随 `AIConfig` 存于 `projectStore`。
- **快速 / 精确（二段式）**：精确模式先「连词成句」成自然语言再发散；快速模式直接用预览内容。该分支封装在 `useAIWordPanel`，`useAIGenerate` 不感知。

## 架构

```
AIPanel.vue（纯展示 + 无参调度）        useKeyboardShortcuts（I → directGenerate / C → clear）
        │ 绑定状态 / 触发                    │ 直接调用
        ▼                                   ▼
useAIWordPanel.ts（模块级单例：AI 状态 + 编排 + 面板展示）
        │  directGenerate() / regenerate()
        │  ├─ 预览为空 → viewText.buildViewText(childrenOf(currentNodeId), viewTextAlgoId)
        │  ├─ precise → runSentenceMaking(预览)  → sentenceText
        │  ├─ user = globalPrompt + localPrompt + body（非空白拼接）
        │  └─ runGenerateIdea(user) → 按行拆词 → show(words)
        ▼
useAIGenerate.ts（纯调用：load prompt → chat → 返回原始文本）
        │  runSentenceMaking / runGenerateIdea
        ▼
provider/openai.ts（OpenAI 兼容 fetch）  ——  createOpenAIProvider(config)
        │  POST {baseURL}/chat/completions
        ▼
stores/ai.ts（连接参数，localStorage 持久化）
        │
        ▼
constants/ai.ts（AI_DEFAULT_CONFIG / AI_WORD_PROMPT / AI_SENTENCE_PROMPT）
```

## 相关文件

| 文件 | 职责 |
| --- | --- |
| `src/composables/useAIGenerate.ts` | 纯 AI 调用层。`runSentenceMaking(text)`（连词成句）/ `runGenerateIdea(text)`（发散·词生成），输入输出均为纯文本，加载对应对应提示词并调 provider |
| `src/composables/useAIWordPanel.ts` | 模块级单例：AI 生成状态（`mode` / `previewText` / `sentenceText` / loading / error）+ 无参编排（`directGenerate` / `regenerate` / `sentenceMaking` / `generatePreview` / `setAIMode` / `syncAIMode`）+ 面板展示（`show` / `close` / `setMode` / `clear` + `visible` / `words` / `displayMode`） |
| `src/utils/viewText.ts` | 空间布局文本算法注册表（rowCluster / lineHit / collectAll）+ `buildViewText` 调度器，作为上下文唯一来源 |
| `src/types/ai.ts` | `AIConfig { localPrompt, mode, viewTextAlgoId }` |
| `src/stores/project.ts` | 项目级 AI 配置：`globalPrompt` / `defaultAIConfig` / `nodeAIConfigs: Map<nodeId, AIConfig>` / `getAIConfig`(未配置回退默认) / 各 setter（`markDataDirty` 标脏，不入 undo） |
| `src/provider/aiProvider.ts` | 纯类型：`ChatMessage` / `ChatOptions` / `AIProviderConfig` / `AIProvider` |
| `src/provider/openai.ts` | OpenAI 兼容实现：`createOpenAIProvider(config)` + `AIError` 分级错误类 |
| `src/stores/ai.ts` | `useAIConfigStore`：`baseURL` / `apiKey` / `model` / `timeoutMs` / `temperature`，`useStorage` 持久化 |
| `src/constants/ai.ts` | `AI_DEFAULT_CONFIG`、`AI_WORD_PROMPT`（发散·词生成）、`AI_SENTENCE_PROMPT`（连词成句） |
| `src/utils/projectFile.ts` | 项目文件序列化/解析 `aiConfig` 字段（`globalPrompt` / `defaultConfig` / `nodeConfigs`），缺字段/悬空 nodeId 自愈 |
| `src/composables/useProjectFile.ts` | 新建/打开项目时收集与载入 AI 配置 |
| `src/components/panels/AIPanel.vue` | 左侧活动栏 AI 面板，纯展示 + 绑定 `useAIWordPanel` 状态并触发无参方法 |
| `src/components/floating/FloatingAIWordPanel.vue` | AI 生成词浮动面板（panel 模式），只展示共享状态 + 添加/关闭 |
| `src/components/floating/FloatingAIWordStrip.vue` | AI 生成词底部小字条（strip 模式），只展示共享状态 + 清除 |
| `src/composables/useKeyboardShortcuts.ts` | 快捷键：`I` → `useAIWordPanel().directGenerate()`，`C` → `clear()`（不再接收 AI 回调参数） |
| `src/composables/useAIWordAdd.ts` | 词 → 节点：`addWord` / `addAll`（视口坐标换算 + 命令层入栈） |
| `src/__tests__/provider/openai.test.ts` | provider 单测（mock fetch） |
| `src/__tests__/composables/useAIGenerate.test.ts` | useAIGenerate 单测（对应提示词 / 纯文本进出） |
| `src/__tests__/composables/useAIWordPanel.test.ts` | useAIWordPanel 编排单测（无参 directGenerate / regenerate / sentenceMaking / setAIMode，mock fetch） |
| `src/__tests__/utils/projectFile.test.ts` | 项目文件含 aiConfig 的序列化/解析自愈单测 |

## 上下文构建

上下文唯一来源为 `viewText` 空间布局算法（无连线）。`buildViewText(nodes, algoId, params?)` 由 `utils/viewText.ts` 注册表提供：rowCluster（y 重叠贪心聚行）/ lineHit（搜索线命中聚行）/ collectAll（扁平列表）。面板的算法下拉与生成上下文共用同一注册表。

`useAIWordPanel.directGenerate()` 在预览为空时，以 `nodeStore.childrenOf(currentNodeId)` + `cfg.viewTextAlgoId` 调用 `buildViewText` 自动生成上下文预览，并回填到 `previewText`。

## 提示词与模式（AIConfig）

`AIConfig`（`src/types/ai.ts`）：
- `localPrompt`：局部提示词，跟随观察节点
- `mode: 'fast' | 'precise'`：快速 / 精确（精确 = 先连词成句）
- `viewTextAlgoId`：生成上下文时选用的 viewText 算法 id

> 已移除 `includeConnections`（带连线上下文不再存在）。

存于 `projectStore`（项目级，随项目文件 `aiConfig` 字段序列化，`markDataDirty` 标脏不入 undo）：
- `globalPrompt`：全局提示词，为所有节点提供项目背景
- `defaultAIConfig`：全局默认配置
- `nodeAIConfigs: Map<nodeId, AIConfig>`：按节点覆盖；`getAIConfig(nodeId)` 未配置时回退 `defaultAIConfig`

写入口：`setGlobalPrompt` / `setDefaultAIConfig` / `setNodeAIConfig(nodeId, cfg)` / `clearNodeAIConfig(nodeId)`。快速/精确模式由 `useAIWordPanel.setAIMode(mode)` 写回 project（合并到 `AIConfig`）。连接参数（baseURL / model 等）在独立 `stores/ai.ts`（localStorage），与项目级提示词配置分离。

## 编排（useAIWordPanel）

- `directGenerate()`：无参。预览为空 → 自动生成上下文预览；精确模式 → 连词成句结果为空则自动（先补预览再）连词成句；`user = global + local + body` → `runGenerateIdea` → 按行拆词 → `show(words)`。错误内部捕获置 `error`，不向外抛出（供 `I` 键 `void` 调用安全）。
- `regenerate()`：无参。强制重算预览（精确模式再连词成句），再走与 `directGenerate` 相同的发散流程。
- `sentenceMaking()`：无参。把内部 `previewText` 转自然语言，写回 `sentenceText`（供 AIPanel「连词成句」按钮）。
- `generatePreview()`：无参。用 viewText 重算上下文预览，回填 `previewText`。
- `setAIMode(mode)` / `syncAIMode()`：AI 模式读写（`syncAIMode` 从 project 同步，跟随节点切换）。

## AI 生成词浮动面板

「直接生成 / 重新生成」（AIPanel）与键盘 `I` 都经 `useAIWordPanel.directGenerate()` 生成，完成后注入共享状态、经浮动面板展示（点击词可添加为节点），数据流如下：

```
AIPanel「直接生成/重新生成」 / 键盘 I
        │  均调用 useAIWordPanel().directGenerate()（无参）
        ▼
useAIWordPanel.directGenerate()  生成 → 按行拆词 → show(words)
        │  共享 reactive 单例（visible / error / words / mode / previewText / sentenceText / displayMode）
        ▼
FloatingAIWordPanel / FloatingAIWordStrip   只读展示 + 添加/关闭
```

- **`useAIWordPanel`**（`src/composables/useAIWordPanel.ts`）：模块级单例，同时承载 AI 生成编排与面板展示状态。状态 `visible / error / words / mode / previewText / sentenceText / generating / regenerating / sentenceLoading / displayMode`；动作 `show / close / setMode`（strip/panel 切换）/ `clear` 与生成方法。
- **`FloatingAIWordPanel` / `FloatingAIWordStrip`**：只读取共享状态展示内容 + 添加/关闭，不调用 AI 生成逻辑。按 `displayMode` 二选一挂在 `AppShell`。
- **`useAIWordAdd`**（`src/composables/useAIWordAdd.ts`）：`addWord` / `addAll` 把词添加为当前视图节点（视口坐标换算 + `useCommands` 入历史栈），浮动面板与 strip 共用。
- **入口**：AIPanel「直接生成 / 重新生成」按钮与键盘 `I`（经 `useKeyboardShortcuts` 直接调 `useAIWordPanel.directGenerate()`）。strip/panel 展示模式切换保留在工具栏。

## 面板（AIPanel）

左侧活动栏 `'ai'` 面板（`constants/panels.ts` 中 id `'ai'`）：
- **全局提示词** textarea（经 `setGlobalPrompt` 写入，触发 dirty，自动保存）
- **当前视图设置**：局部提示词 / 处理模式(快速·精确) / 空间布局算法下拉；`localPrompt` 与 `viewTextAlgoId` 本地可编辑副本经**深层 watch 自动保存**到 `setNodeAIConfig(currentNodeId, ...)`（无「保存」按钮），模式经 `useAIWordPanel.setAIMode` 管理并写回，「恢复默认」调 `clearNodeAIConfig`
- **上下文预览**：可编辑文本框（绑定 `useAIWordPanel.previewText`），「生成预览」按钮调 `generatePreview()`，用户可自由编辑
- **精确模式**额外「连词成句」按钮：调 `sentenceMaking()`，输出到第二个可编辑文本框（绑定 `sentenceText`）
- **底部操作**：「直接生成」（调 `directGenerate()`）/「重新生成」（调 `regenerate()`）；错误经 `useAIWordPanel.error` 展示

## 使用方法

日常使用走 **AIPanel**：快速模式点「生成预览」→ 编辑预览 → 点「直接生成」，或直接点「重新生成」（预览为空时也会自动生成）；精确模式再经「连词成句」得到第二个可编辑预览框作为「直接生成」输入。两者生成完成后都会经 `useAIWordPanel` 把结果展示到浮动面板并可直接点击添加为节点。键盘 **`I`** 与「直接生成」等价（无参触发同一 `directGenerate()`），**`C`** 清除生成词状态。

## 配置

- **项目级**（`projectStore`，随项目文件序列化）：`globalPrompt` + `defaultAIConfig` + `nodeAIConfigs`，经 AI 面板编辑。
- **连接参数**（`useAIConfigStore`，localStorage `aidea-ai-config-*`）：`baseURL: 'http://localhost:11434/v1'`（Ollama 兼容端点）、`model: 'tiny-llama:1.1b'`、`timeoutMs: 60000`、`temperature: 0.7`、`apiKey` 默认空（本地模型无需 key）。

## 健壮性

- 超时：AbortController + 定时器（默认 60s），与外部 signal 合并
- 网络错误：自动重试 1 次（约 500ms 退避）
- 错误分级：`AIError.type` —— `timeout` / `network` / `auth`（401/403）/ `http` / `parse` / `not-implemented`（stream 预留）
- 上下文为空：`directGenerate()` 返回空数组，不发起请求
- 生成失败：`useAIWordPanel` 内部捕获并写入 `error`，不向外抛出（I 键 `void` 调用安全）

## 边界与后续

- 生成结果经浮动面板展示（可点击添加为节点），但**不渲染到画布**；后续采纳流程（parse.ts / suggestStore / 新节点）未实现
- 项目顾问（评价/建议）未实现；架构已预留 —— 新增任务只需在 `useAIGenerate` 增加一个「加载对应提示词」的纯调用函数，再在 `useAIWordPanel` 编排即可扩展
- `stream` 分支已预留接口但未实现，命中即抛 `not-implemented`
- apiKey 存 localStorage 仅适用于本地模型 / 自用；正式发布可加薄后端代理，因 `baseURL` 可配，仅需指向代理，`AIProvider` 接口不变