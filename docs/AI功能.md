# AI功能（内置插件 plugins/ai）

## 核心架构

AI 功能已从主程序**完全迁移为内置插件** `plugins/ai`（id `ai`），主程序不含任何 AI 代码；全部能力经插件 SDK 注册。数据分两类严格区分：

- **连接配置与发散方向 → 插件 config**（`adapter.for('ai').config` 读写 `aidea-plugin-config.ai`），应用级不入项目、不入 undo；
- **项目级提示词/模式 → additions 的 `ai:projectConfig`**，随项目文件保存、一次 set 单条历史可撤销。

不做旧版兼容（迁移前旧数据不再读取）。

## 相关文件

| 文件 | 职责 |
|---|---|
| plugins/ai/index.ts | 插件入口：manifest + setup 注册（面板/设置栏目/快捷键/右键菜单/浮动层） |
| plugins/ai/constants.ts | system 提示词、默认方向、AI_SENTENCE_PROMPT |
| plugins/ai/types.ts | AIConfig / AIDivergenceDirection |
| plugins/ai/provider/ | openai.ts（OpenAI 兼容）、aiProvider.ts（接口） |
| plugins/ai/composables/ | useAIWordPanel / useAIGenerate / useAIWordAdd |
| plugins/ai/stores/ | aiDirections / aiConfig / aiProject |
| plugins/ai/utils/viewText.ts | 空间布局算法注册表 + buildViewText 调度器 |
| plugins/ai/components/ | AIPanel / AISettingsPanel / AIConnectionSettings / AIDirectionsSection / FloatingAIWordPanel |
| plugins/ai/__tests__/ | useAIWordPanel / AIPanel（空视图挂载冒烟）/ viewText / AISettingsPanel / AIConnectionSettings 等 |
| plugins/ai/locales/ | 插件自有语言包（zh-CN/en-US，经 createT） |

## 关键类型与注册面

- 类型：`AIConfig` / `AIDivergenceDirection` / `AIProjectData = { globalPrompt; default; byNode }`。
- 注册面：`registerPanel`（AI 面板，左侧 SparklesOutline）/ `registerSettingsCategory`（AI 设置，单栏目三分区）/ `registerFloatingLayer`（生成词浮动层，短 id `words`）/ `registerContextMenuItem`（右键「发散」children 子菜单）/ `registerShortcutAction`（`ai:generate` 默认 `i` / `ai:clear` 默认 `c`）。
- 关键函数：`buildViewText` / `ViewTextAlgorithm{ id,labelKey,params,build }` / `VIEW_TEXT_ALGORITHMS`；`generatePreview()`（上下文预览，标题=祖先链路径，空视图兜底）、`directGenerate()`（统一走默认发散方向）、`runGenerateIdea`、`runSentenceMaking`。

## 调用链

工作流：选中节点文本 → **viewText 算法**生成上下文 → `runGenerateIdea` 发散 → 按行拆词 → `floating.open('words')` 打开浮动面板 → 点击词经 `useAIWordAdd` 添加为节点。

- 「直接生成/重新生成（AI 面板）与快捷键 `i`」统一走 `directGenerate()`；`c` 清除。
- 精确模式先「连词成句」（`runSentenceMaking` + AI_SENTENCE_PROMPT）再发散。

## 视图转文本（策略模式 + 算法注册表）

`ViewTextAlgorithm` 是自带参数 schema + `build` 的自描述对象；面板只读 `VIEW_TEXT_ALGORITHMS`，动态渲染算法下拉与参数控件，并统一调用调度器 `buildViewText`。

当前算法：
- `rowCluster` 行聚类（tolerance / includeCoords / separator）；
- `lineHit` 直线命中；
- `collectAll` 直接收集（默认，忽略空间按序）。

替换/新增算法 = 在注册表追加一个对象，面板零改动。

### 上下文预览（generatePreview）

- 标题 = 从根到当前视图节点的祖先链首行路径 `根节点/父节点1/.../当前视图节点`（取链上各节点 `text` 首行、去空后用 `/` 拼接），作为结构化文本前缀交给 `buildViewText` 输出（默认空项目中根节点视图标题即根节点名，如 `未命名项目`）。
- **空视图兜底**：当前视图无子节点时，不加布局算法，直接以祖先链路径作为预览内容，避免空正文导致无法生成；有子节点时仍走 `viewText` 编排。
- AI 面板不按「当前视图无节点」拦截：空视图同样展示表单、可生成预览并调用 AI 功能（极端情况：根节点无名称且无子节点时预览仍为空，上下文为空则返回空数组）。

## 实现细节与踩坑点

- 连接配置/发散方向 → 插件 config（即改即写，不随项目）；项目提示词/模式 → additions `ai:projectConfig`（入 undo）。
- 生成词浮动面板显隐经 `adapter.for('ai').floating`（短 id `words`）；`FloatingAIWordPanel` 是**纯内容组件**，窗口壳（定位/拖拽把手/转场/Teleport）由通用 `FloatingWindow` 提供；默认隐藏，关闭重开回视口中心。
- 紧凑 strip 模式与「切换显示模式」按钮已随迁移移除，生成词仅浮动面板一种形态。
- **`NScrollbar` 插槽不能包无指令的 `<template>`**：曾因在 `NScrollbar` 内用裸 `<template>`（无 `v-if`/`v-else`/`v-for`）包裹全部区块，导致整面板空白渲染（挂载冒烟 `AIPanel.test.ts` 复现并回归保障）；区块应直接作为 `NScrollbar` 子节点。