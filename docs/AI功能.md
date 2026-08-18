# AI 功能

调用本地 Ollama 大模型，把「当前视图节点」转成上下文文本发给模型发散灵感，结果经浮动面板展示、可点击添加为节点。尚未实现渲染到画布 / 项目顾问建议。

## 工作流

```
视图节点 → viewText 空间布局算法生成上下文
        → runGenerateIdea({...}) 调模型发散
        → 按行拆词 → 浮动面板(FloatingAIWordPanel/Strip) 展示
        → 点击词调 useAIWordAdd 添加为节点
```

- 「直接生成 / 重新生成」（AIPanel）与快捷键 **I** 统一走 `useAIWordPanel.directGenerate()`，用**默认发散方向**；`C` 清除生成词。
- 快速 / 精确二段式：精确模式先「连词成句」（`runSentenceMaking` + `AI_SENTENCE_PROMPT`）再发散；`mode` 存于 `AIConfig`。

## 发散方向

`AIDivergenceDirection = { id, title, prompt?, separator? }`，管理在**设置弹窗（编辑→设置）**的「发散方向」分区：可增删改、拖拽排序、恢复默认、设置默认方向。默认方向即生成按钮与 I 键所用。

- `prompt` 为发散角度指令，可含 `${from}` 占位（被替换为发散起点文本）；含 `${from}` 才注入起点，否则起点被忽略（「任意发散」即此语义）。
- `separator` 为多节点起点合并分隔符（默认空格）。
- 特殊方向「任意 / 聚焦」用固定 id（`direction-any` / `direction-focus`）；其余预设与用户新增用 `nanoid`。`getDefaultDirection()` 在默认方向失效时回退任意发散。
- 数据持久化于 `stores/aiDirections.ts`（localStorage `bb-ai-directions` / `bb-ai-default-direction`），不随项目文件序列化。右键菜单「发散」从 `directionList` 全量列出可用方向，选中起点后围绕其发散。

## 提示词分层

- system 按 `runGenerateIdea` 的 `isDescription` 二选一：`AI_GENERATE_IDEA_NODE`（结构化文本）/ `AI_GENERATE_IDEA_DESCRIPTION`（连贯描述）。
- 全局提示词 `globalPrompt` + 节点级 `localPrompt` 经 `composeAddition` 拼为 user 的「# 补充」段；上下文为「# 上下文」、方向指令为「# 指令」。
- user 消息按「# 上下文 / # 指令 / # 补充（可有可无）」三段组织。

## 连接与配置

- **连接参数**：`stores/ai.ts`（localStorage `aidea-ai-config-*`）：`baseURL`（默认 Ollama `http://localhost:11434/v1`）、`model`、`timeoutMs`、`temperature`。`provider/openai.ts` 提供 OpenAI 兼容实现（含网络重试 1 次、错误分级 `AIError`）。
- **项目级提示词 / 模式**：随项目文件序列化（`projectStore` 的 `globalPrompt` + `AIConfig{ localPrompt, mode, viewTextAlgoId }`，可按节点覆盖）。

## 核心文件

| 文件 | 职责 |
| --- | --- |
| `composables/useAIGenerate.ts` | 纯调用层：`runSentenceMaking(text)`、统一入口 `runGenerateIdea({ text, isDescription, from?, direction, addition? })` |
| `composables/useAIWordPanel.ts` | 模块级单例：AI 生成状态 + 无参编排（`directGenerate` / `regenerate` / `sentenceMaking` / `generatePreview`）+ 面板展示状态 |
| `stores/aiDirections.ts` | 发散方向 CRUD / 排序 / 默认方向 / 恢复默认（localStorage 持久化） |
| `constants/ai.ts` | system 提示词、`DEFAULT_AI_DIRECTIONS`、`AI_DIRECTION_ANY/FOCUS`、`AI_SENTENCE_PROMPT` |
| `utils/viewText.ts` | 上下文唯一来源：空间布局算法注册表 + `buildViewText` |
| `panels/AIPanel.vue` / `panels/SettingsModal.vue` | AI 面板 / 设置弹窗（含发散方向管理分区） |
| `floating/FloatingAIWordPanel(vue/Strip).vue`、`useAIWordAdd.ts` | 生成词展示与添加为节点 |

## 边界

- 生成结果经浮动面板展示并添加为节点，但**不渲染到画布**；采纳流程未实现。
- 项目顾问（评价 / 建议）未实现；`stream` 已预留接口未实现。