# AI 功能

调用本地 Ollama 大模型（默认为 `qwen2.5-coder:7b`），把当前视图上下文发给模型，把回复打印到控制台。**当前仅实现调用与打印，尚未实现渲染到画布 / 采纳建议**。

## 架构

```
useAIAssist.ts（编排入口）
   ├─ buildNodeContext()   # 纯函数：当前视图转结构化文本（# 设定 / ## 节点树 / ## 连线表）
   ├─ collectSubtree()     # 纯函数：收集子树按缩进成行
   ├─ runAIAssist()        # 工作流：发结构化上下文给模型，发散思考
   └─ runAIWordGeneration()# 工作流：发当前视图一层深度节点列表，生成 10 个词
          │
          ▼
   provider/openai.ts（OpenAI 兼容 fetch 实现）  ——  createOpenAIProvider(config)
          │  POST {baseURL}/chat/completions
          ▼
   stores/ai.ts（aiConfig store，localStorage 持久化）
          │
          ▼
   constants/ai.ts（AI_DEFAULT_CONFIG / AI_SYSTEM_PROMPT / AI_WORD_PROMPT）
```

## 相关文件

| 文件 | 职责 |
| --- | --- |
| `src/composables/useAIAssist.ts` | 编排入口。`buildNodeContext` / `collectSubtree` 为只读纯函数；`runAIAssist` / `runAIWordGeneration` 负责取当前视图、组 messages、调用 provider、打印回复 |
| `src/provider/aiProvider.ts` | 纯类型：`ChatMessage` / `ChatOptions` / `AIProviderConfig` / `AIProvider` |
| `src/provider/openai.ts` | OpenAI 兼容实现：`createOpenAIProvider(config)` + `AIError` 分级错误类 |
| `src/stores/ai.ts` | `useAIConfigStore`：`baseURL` / `apiKey` / `model` / `timeoutMs` / `temperature`，`useStorage` 持久化 |
| `src/constants/ai.ts` | `AI_DEFAULT_CONFIG`（默认 Ollama 端点）、`AI_SYSTEM_PROMPT`（发散提示词）、`AI_WORD_PROMPT`（词生成提示词） |
| `src/__tests__/provider/openai.test.ts` | provider 单测（mock fetch） |
| `src/__tests__/composables/useAIAssist.test.ts` | 编排函数单测（mock fetch） |

## 两个工作流

### runAIAssist(targetNodeId?)
发散思考。把当前视图结构化上下文发给模型，回复为分发式结构化描述。

- 取目标节点（默认 `project.currentNodeId`）
- `buildNodeContext(nodeStore, targetId)` 生成结构化上下文（含 `# 设定` / `## 节点树` / `## 连线表`）
- `system(AI_SYSTEM_PROMPT)` + `user(上下文)` 调用
- `console.log('[AI 回复]', reply)`，返回回复文本

### runAIWordGeneration(targetNodeId?)
生成 10 个词。把当前视图**展示的所有节点**（视口一层深度子级）发给模型，让模型随机生成 10 个相关中文词，换行分隔、无序号等其它信息。

- 取目标节点（默认 `project.currentNodeId`）
- `collectSubtree(nodeStore, targetId, { maxDepth: 1 })` 收集一层深度子级节点文本
- `system(AI_WORD_PROMPT)` + `user(节点列表)` 调用
- `console.log('[AI 词生成回复]', reply)`，返回回复文本

## 使用方法

浏览器控制台调用（无需接 UI）：

```js
runAIAssist()          // 发散当前视图
runAIWordGeneration()  // 生成 10 个词
```

## 配置

`useAIConfigStore` 持久化在 `localStorage('aidea-ai-config-*')`，默认值：
- `baseURL: 'http://localhost:11434/v1'`（Ollama 兼容端点）
- `model: 'qwen2.5-coder:7b'`
- `timeoutMs: 60000`、`temperature: 0.7`，`apiKey` 默认空（本地模型无需 key）

## 健壮性

- 超时：AbortController + 定时器（默认 60s），与外部 signal 合并
- 网络错误：自动重试 1 次（约 500ms 退避）
- 错误分级：`AIError.type` —— `timeout` / `network` / `auth`（401/403）/ `http` / `parse` / `not-implemented`（stream 预留）
- 上下文为空：warn 后返回空字符串，不发起请求

## 边界与后续

- 当前只打印到控制台，不渲染；后续采纳流程（parse.ts / suggestStore / 新节点）未实现
- `stream` 分支已预留接口但未实现，命中即抛 `not-implemented`
- apiKey 存 localStorage 仅适用于本地模型 / 自用；正式发布可加薄后端代理，因 `baseURL` 可配，仅需指向代理，`AIProvider` 接口不变

## 格式化文本功能

暂时没有加入到AI的提示词中，后续会加入，相关文件：
`./src/utils/viewText.ts`：文本收集算法和格式化函数
`./src/components/panels/ViewTextPanel.vue`：格式化文本功能面板
