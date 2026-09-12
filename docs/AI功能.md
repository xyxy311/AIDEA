# AI 功能（内置插件 `plugins/ai/`）

> AI 功能已从主程序完全迁移为**内置插件** `plugins/ai/`（插件 id `ai`），主程序不再包含任何
> AI 代码（原 `src/provider/`、`src/stores/ai*.ts`、`src/constants/ai.ts`、`src/types/ai.ts`、
> `src/composables/useAI*.ts`、`src/utils/viewText.ts` 及 AI 组件均已删除）。本文描述插件形态。

## 功能面

全部经插件 SDK 注册（`plugins/ai/index.ts` 的 `setup(ctx)`）：

| 能力 | 注册面 | 说明 |
| --- | --- | --- |
| AI 面板 | `ctx.register.registerPanel`（左侧活动栏，SparklesOutline） | 全局提示词 / 视图级局部提示词与模式 / 上下文预览 / 连词成句 / 直接生成 / 重新生成 |
| AI 设置 | `ctx.register.registerSettingsCategory`（设置弹窗「AI 设置」栏目；**单栏目三分区**——一个插件至多一个设置栏目，栏目壳 `AISettingsPanel`） | ① AI 连接：连接参数编辑（baseURL / model / apiKey / 超时 / 温度，即时写回插件 config，可恢复默认）；② 快捷键：改键行（`ShortcutActionRow`）；③ 发散方向：方向 CRUD / 拖拽排序 / 默认方向 / 恢复默认（`AIDirectionsSection` 子组件） |
| 生成词浮动面板 | `ctx.register.registerFloatingLayer({ id, title?, component })`（宿主 `PluginFloatingHost` 逐条渲染通用窗口壳 `FloatingWindow`） | 展示生成结果，点击词经 `useAIWordAdd` 添加为节点；显隐经 `adapter.for('ai').floating` 运行时 API（open/close/toggle/isVisible），窗口拖动/定位/转场归宿主 |
| 右键「发散」子菜单 | `ctx.register.registerContextMenuItem`（selection scope，`children` 工厂按方向展开子项） | 主程序右键菜单的 children 子菜单能力即为此引入 |
| 快捷键 | `ctx.register.registerShortcutAction` | `ai:generate`（默认 I，直接生成）/ `ai:clear`（默认 C，清除生成词） |

紧凑模式（strip 浮动条）与顶部「切换显示模式」按钮（`AIDisplayModeButton`）已随迁移**移除**，
生成词仅浮动面板一种展示形态。

## 工作流

```
选中节点文本（或当前视图节点）→ viewText 空间布局算法生成上下文
        → runGenerateIdea({...}) 调模型发散
        → 按行拆词 → floating.open('words') 打开浮动面板 → 点击词添加为节点
```

- 「直接生成 / 重新生成」（AI 面板）与快捷键 **I** 统一走 `useAIWordPanel.directGenerate()`，
  用**默认发散方向**；**C** 清除生成词。
- 快速 / 精确二段式：精确模式先「连词成句」（`runSentenceMaking` + `AI_SENTENCE_PROMPT`）再发散。
- 生成词浮动面板的**显隐经插件浮动运行时 API**（`scope.floating`，短 id `words`）：
  `useAIWordPanel` 的 show/close/clear 转发 `floating.open/close`，visible 只读暴露
  `floating.isVisible`；面板组件 `FloatingAIWordPanel` 是**纯内容组件**——窗口壳
  （定位 / 拖拽把手条 / 转场 / Teleport）由通用件 `FloatingWindow`（`src/components/common/`）提供，
  插件注册只填内容 + 标题 `t('aiWord.title')`。浮动层默认隐藏（open 才可见），关闭重开回视口中心。

## 持久化（两类严格区分）

### 1. 连接配置与发散方向 → 插件 config（应用级，不入项目）

经 `adapter.for('ai').config` 读写 `aidea-plugin-config.ai` 文件（`data` 段）：
- 连接参数（`stores/aiConfig.ts`）：`baseURL` / `model` / `timeoutMs` / `temperature`；
- 发散方向（`stores/aiDirections.ts`）：方向列表、默认方向、恢复默认。
随插件启停保留，不进项目文件、不入 undo。

### 2. 项目级提示词 / 模式 → additions `ai:projectConfig`（随项目文件保存、入 undo）

经 `adapter.for('ai').additions` 读写完整键 **`ai:projectConfig`**（`stores/aiProject.ts`，
`AIProjectData = { globalPrompt: string; default: AIConfig; byNode: Record<nodeId, AIConfig> }`）：
- 一次 set = 单条历史（可撤销），随项目文件 `additions` 字段保存 / 打开恢复；
- 原主程序 `projectStore` 的 `globalPrompt` / `defaultAIConfig` / `nodeAIConfigs` 已删除。

## 旧数据迁移（一次性，均幂等）

1. **localStorage 旧键**：旧版发散方向（`bb-ai-directions` / `bb-ai-default-direction`）与连接配置
   （`aidea-ai-config-*`）由插件内各自的启动迁移逻辑搬入 `aidea-plugin-config.ai`；
2. **旧项目文件 `aiConfig` 字段**：主程序加载项目时（`useProjectFile.loadProjectIntoApp` 的迁移桥）
   若文件含 `aiConfig` 字段，把 `{ globalPrompt, defaultConfig, nodeConfigs }` 转换为
   `{ globalPrompt, default, byNode }` 一次性写入 additions `ai:projectConfig`
   （直调 additions store 底层写，非 undo，仅当字段存在时执行）；
3. **新保存的项目文件不再写出 `aiConfig` 字段**（`serializeProject` 已去参），AI 项目级数据
   只经 `additions['ai:projectConfig']` 序列化；
4. **快捷键覆盖**：旧内置 `aiGenerate` / `aiClear` 的用户改键（`aidea-shortcuts`）由
   shortcuts store 启动迁移一次性搬入 `aidea-plugin-config.ai` 的 `shortcuts` 段
   （`generate` / `clear`）并删除旧条目。

## 插件内部结构

```
plugins/ai/
  index.ts          # 插件入口：manifest + setup 注册（面板/设置栏目/快捷键/右键菜单/浮动层）
  constants.ts      # system 提示词、默认方向、AI_SENTENCE_PROMPT 等（迁自 src/constants/ai.ts）
  types.ts          # AIConfig / AIDivergenceDirection 等
  provider/         # openai.ts（OpenAI 兼容实现）、aiProvider.ts（接口）
  composables/      # useAIWordPanel（共享单例编排）、useAIGenerate（纯调用层）、useAIWordAdd
  stores/           # aiDirections（发散方向）、aiConfig（连接配置）、aiProject（additions 项目级数据）
  utils/viewText.ts # 空间布局算法注册表 + buildViewText（迁自 src/utils/viewText.ts）
  components/       # AIPanel / AISettingsPanel（设置栏目壳：一栏目三分区）/
                    # AIConnectionSettings（分区①子组件）/ AIDirectionsSection（分区③子组件）/
                    # FloatingAIWordPanel
```
