# AGENTS.md - 头脑风暴白板 (Vue3 + Konva + Naive UI)

**所有回复、思考、代码注释必须使用中文（代码或特殊术语除外）。**

## 核心概念

- **一切皆节点**：经 `parentId` 构建树（邻接表），查看某节点子级即一个"视图"。
- **连线表示同级关系**，非父子关系，嵌套在父节点 `connections` 中随父迁移。
- **根节点**（`parentId === null`，id 固定 `'root'`）即整个项目，`text` 即项目名（单一数据源），几何与样式无意义。
- 数据只存 `parentId`，nodeStore 用 `computed` 派生 `childrenIndex`。
- **内联视图**：节点展开后用独立 Konva Stage（DOM 覆盖层）渲染子级画布，实现"画布内嵌画布"。
- **节点引用**：`#` 开头定义可引用名（text 去 `#` 第一行 trim），`@名 ` 引用他人（主色高亮+下划线，点击切到该节点子视图）。重名禁止（先到先得）。nodeStore 用 `computed` 派生 `referenceIndex`（name -> nodeId，惰性缓存）；useCommands 文本写入加重名校验返回 `{ok, conflictRef}`，冲突不写不入栈；@ 补全经 useReferenceAutocomplete + TextAutocomplete。

## 命令与验证

```
npm run dev          # Vite HMR
npm run test         # vitest run --passWithNoTests
npm run type-check   # vue-tsc --noEmit
npm run build        # type-check + vite build
```

完成标准：`type-check` 零错误 + `test` 全绿。**不要启动 dev server**（agent 无法验证 Canvas 渲染）。

## 技术栈

`konva` + `vue-konva` v3（`v-` 前缀）｜`naive-ui` + `@vicons/ionicons5`｜`pinia` setup store（node/view/project/history）｜`@vueuse/core`、`nanoid`｜vitest + happy-dom。别名 `@/` -> `src/`。

## 目录

```
types/      纯接口
constants/  设计 token：尺寸/几何/节点连线数据色与预设样式/缩放范围
utils/      纯函数（generateId, calculateTextContentSize, command, reference[引用名提取/片段解析/布局]）
config/     配色 colorSchemes.ts：亮/暗（Naive theme + overrides + CSS 变量 + 画布 chrome 色）
locales/    UI 文本 zh-CN.json（i18n 占位层）
stores/     node(全局树+连线+派生索引 childrenIndex/referenceIndex/tagIndex) / tags(项目级标签定义) / view(工厂，视口/选中/编辑，不存数据)
            / project(导航+快照+销毁内联实例) / presets / history(undo+patch+batch+coalesce) / theme / layout(活动栏顺序/激活)
composables/ useActiveView / useCommands(数据写统一入口) / useNodeTree / useNodeViewLink / useReferenceAutocomplete / useT
            / useAIAssist(AI上下文解析+调用：buildNodeContext 把根→目标路径+子级+连线表转结构化语言描述供模型输入，collectSubtree 收集子树按缩进成行，只读 nodeStore；runAIAssist 发散当前视图、runAIWordGeneration 生成10个词，调 provider 后打印到控制台)
components/  canvas(/CanvasStage/WhiteboardNode/Connection/OverviewMap/InlineView*/TextAutocomplete) / toolbar / panels(left:NodeTreePanel/ReferencesPanel/SearchPanel/PresetManagerPanel/TagsPanel
             / right:NodePropertyEditor/ConnectionPropertyEditor) / layout(ActivityBar/MenuBar/AppShell)
             / common(DraggableSortList — 通用可拖拽排序列表) / floating(/FloatingPropertyEditor / FloatingColorStrip / FloatingPresetEditor — Word 风格浮动属性编辑器)
```

组件通常经 `useActiveView()` 统一访问 nodeStore / project / view。

## 核心架构

### 撤销重做（三层）

```
交互层 -> 命令层 useCommands -> 数据层 nodeStore/project
```

- **useCommands 是唯一数据写入口**：捕获旧值 -> nodeStore action -> `DataPatch` -> `history.pushCommand`。
- **例外**：拖拽 mousemove 的 `moveNode`、transform-end 的 `resizeNode` 实时渲染不入栈，结束事件时 `commit*` 入栈；内联视图矩形缩放是视图状态（不入 undo）。
- **DataPatch** = `{ nodeChanges, connChanges }`，change 为 `add`/`remove`/`modify`；`modify` 只存变化字段，`add`/`remove` 存完整深拷贝。
- **coalesce**：属性面板连续输入用 `coalesceKey`，1s 内同 key modify 合并。
- **batch**：`beginBatch`/`commitBatch`/`rollbackBatch` 包裹复合操作，入栈为单条历史。

### 左侧活动栏与面板

- 布局：`ActivityBar`（固定 48px 竖向条，始终可见）+ `LeftSidebar`（面板容器，可 resize，收起=宽度 0 完全隐藏）。
- **活动栏**：图标序列渲染 `layout.panels`（顺序受拖拽 reorder 影响），元信息从 `PANEL_REGISTRY` 解析（`constants/panels.ts`：id/icon/titleKey + `PANEL_COMPONENTS` 组件映射）。新增面板只需在 registry 注册。
- **收起/展开只经活动栏**：点击图标 = `layout.togglePanel(id)`（同 id → 收起，激活由 `activePanelId` 驱动，null=收起）。面板组件**无 header**，内部自带 `panel-header` 标题栏。
- **拖拽排序**：HTML5 drag（dragstart/dragover/drop）调 `layout.reorder`；`dragstart` 置 `suppressClick`、`dragend` 用 `setTimeout(0)` 复位，抑制拖拽后误触 click 切换面板。内存态，不持久化。
- layout store：`panels`（顺序）/`activePanelId`/`lastPanelId`（收起后 `expand()` 恢复）/`togglePanel`/`setActive`/`reorder`/`collapse`/`expand`。
- 新增面板只需在 `constants/panels.ts` 注册，活动栏图标、面板容器、拖拽排序、展开/收起自动生效。

### 预设样式系统（presets store）

- **独立两组数据**：节点预设 `nodePresets` 与连线预设 `connectionPresets` 各自 CRUD/排序；**节点与连线分组完全独立**（`nodeGroups`/`connectionGroups`，各自 localStorage 与 CRUD，互不影响）。预设项含 `groupId`（`null`=未分组）。
- **分组筛选（可见列表）**：`nodeGroupFilter`/`connectionGroupFilter` 各自决定可见列表 `visibleNodePresets`/`visibleConnectionPresets`；`currentNodeGroupId`/`currentConnectionGroupId` 是新建预设默认分组（当前筛选为具体分组时归入，否则未分组）。
- **1-9 快捷键**：作用于当前分组筛选下的可见列表（`visibleNodePresets`/`visibleConnectionPresets` 的对应索引项），随筛选联动。
- **可见列表内重排**：`reorderVisibleNodePresets`/`reorderVisibleConnectionPresets` 在筛选视图内排序，再经 `reorderVisible` 合并回全列表（保持未显示项相对位置）。
- **持久化与自愈（无旧版兼容）**：`useStorage` 写入 localStorage；`validateStorages` 对每项做结构校验，JSON 解析失败或结构不符 → `localStorage.removeItem` 删除坏文件并回退默认值；`sanitizeFilters` 清理指向不存在分组的孤儿筛选；`initDefaults` 确保"内置"保留分组存在、预设为空时用默认预设初始化。
- **单一数据源**：右侧属性编辑器、浮动编辑器、左侧预设管理面板共用 presetsStore，增删改同步。

### 可拖拽排序列表组件（DraggableSortList）

- **通用可拖拽排序列表**：`src/components/common/DraggableSortList.vue`，封装 HTML5 拖拽排序（拖拽手柄、拖拽状态、放置行高亮）与 1-9 序号徽标，供各面板复用。
- **使用方式（面板经插槽封装列表项）**：`:items` 传列表数据（元素须含 `id`）；列表项内容经**默认作用域插槽** `#default="{ item }"` 传入，空态经 `#empty` 插槽。拖拽落点触发 `@reorder(from, to)`，面板据此调用对应 store 的 reorder 方法；整行点击触发 `@row-click="(item) => ..."`（可选）。`:show-shortcut-badge` 控制序号徽标显隐（默认 true）、`:shortcut-title` 设徽标 hover 提示。
- **已使用面板**：`PresetManagerPanel`（预设列表，开启序号徽标）、`TagsPanel`（标签列表，关闭徽标）。
- **复用约定**：**后续新增/改造面板的纵向可拖拽排序列表一律优先复用该组件**，只把「每行内容」封装进作用域插槽，不要在面板内重写拖拽逻辑/样式。行内操作按钮（编辑/删除/改色）需 `@click.stop` 与行点击隔离，避免误触发 `@row-click`。

### 内联视图（DOM 覆盖层渲染）

- `'main'` 常驻；其他值 = 内联实例（viewedNodeId 固定，hostViewId 指向宿主），仅 1 层嵌套，不渲染小地图。
- 每个内联视图 = 独立 Stage，渲染在 InlineViewCanvas（DOM `<div>` 覆盖层）内；CanvasStage 差异全靠 props，无主视图特判。
- 覆盖层只覆盖矩形内容区（标题栏下方），标题栏保留在主 Stage；宿主节点用 InlineViewFrame 替代渲染。
- 坐标：容器样式 = 宿主世界坐标 × 宿主 stageScale + 宿主偏移，top 再偏移标题栏高度。
- 展开/收起为视图操作（右键菜单，仅主视图），不入 undo。
- `project.switchView(id)` = 存快照 -> 销毁全部内联实例 -> 改 viewedNodeId -> 恢复快照。任意时刻仅一套内联实例存活。
- 三个 composable（useNodeDragging / useMarqueeSelection / useConnectionCreation）须注册 window mouseup 兜底（覆盖层阻断 stage 事件）。

### 多语言（i18n 占位层）

- 资源 `src/locales/zh-CN.json`，支持 `{name}` 插值。
- `useT.ts` 导出 `t(key, params?)`，未命中回退 key。
- **所有用户可见 UI 文本必须经 `t()`**，禁止硬编码中文，新增文本同步加 key。迁移 vue-i18n 只需改 `useT.ts` 内部。

### UI 配色与主题

- **两类颜色严格区分**：
  - UI chrome 色（随主题）：画布背景、Transformer 框、框选矩形、连线高亮。定义于 `ColorScheme.canvas`，经 `themeStore.scheme.canvas.*` 响应式绑定。
  - 节点/连线数据色（不随主题）：`DEFAULT_NODE_STYLE`、`PRESET_STYLES`、`DEFAULT_*_PRESETS`、`CONNECTION_STROKE_COLOR`、`PLACEHOLDER_TEXT_COLOR`，存于 `constants/index.ts`。
  - > 新增 UI chrome 色加 `config/colorSchemes`；新增数据色加 `constants`。
- `colorSchemes = { light, dark }`，各含 `theme`/`naiveOverrides`/`cssVars`（`--color-*`）/`canvas`。
- themeStore 单一数据源驱动：Naive UI、CSS 变量（watchEffect 注入 `:root`）、Konva 画布。`useColorMode` 持久化 `localStorage('aidea-theme')`，仅 light/dark（默认浅色）。
- `<style scoped>` 禁止硬编码十六进制，必须用 `var(--color-*)`。

## 关键陷阱

- **reactive(Map) 深度响应式**：nodeStore 用 `reactive(new Map())`（非 shallowRef）。依赖 `childrenOf`/`getConnections` 的 computed 只随 parentId 关系变化重算。
- **Konva 事件冒泡**：Stage 的 `@click`/`@dblclick` 必须过滤 `e.target !== e.currentTarget`。
- **文本编辑器竞态**：`saved` 守卫 + `setTimeout(0)` 延迟 blur，防 Enter 保存二次触发。
- **vue-konva v3 ref**：`ref<VueKonvaRef<Konva.Rect> | null>`，用 `rectRef.value?.getNode()` 取底层实例。
- **渲染不可验证**：正确性只能人工在浏览器验证，agent 完成标准 = type-check + test 双绿。
- **命令层约束**：数据写操作必须经 `useCommands`，不能直接调 nodeStore 写 action（否则不进历史栈）。Exception：拖拽/缩放实时渲染。
- **主题响应式**：`scheme.canvas.*` 色值必须在响应式上下文（computed/template）使用，不能赋给普通 const config。
- **文本与颜色独立访问**：文本经 `t()`；自定义组件色值用 `var(--color-*)`，Konva chrome 色读 `themeStore.scheme.canvas.*`。

## 其它

- **浮动属性编辑器**：Word 风格浮层，选中节点/连线即在选中物旁弹出（归属整个应用，不做视图判定）。Teleport 到 body + `position:fixed`；头部可拖动（无位置记忆，每次选中重锚定）；鼠标移开面板半透明；拖拽节点时经 `useNodeDragging` 的全局信号 `globalIsDraggingNode` 隐藏。面板固定宽度 300px，预设横条 `NScrollbar` 在面板内滚动。节点：自由改色 + 色条；连线：色条（带小样，点击应用完整预设）+ 线型 `NSelect` + 粗细 `NInputNumber` + 有向 `NCheckbox`（非开关）。预设共用 presetsStore，`+` 添加、右键编辑/删除。详见 `docs/浮动属性编辑器.md`。
- **节点搜索面板**：`SearchPanel`（左侧活动栏面板，`'search'`）。搜索逻辑在纯函数层 `utils/search.ts`（`searchNodes`/`buildSearchLines`/`buildDisplayLine`/`highlightLine`），不依赖 store，可单测。搜索整个 `node.text`（含多行）大小写不敏感，**排除根节点**（`parentId === null`）。结果两行展示：标题行（首行）+ 命中行居中片段（命中在首行时 `body=null` 不重复），超长以命中点为中心取窗口 + `…`（命中完整可见）。高亮用 `var(--color-primary-soft)` 淡底 + `var(--color-primary-pressed)` 文字。点击行 `project.switchView(nodeId)` 进入子视图。新增面板只需在 `constants/panels.ts` 注册 id + 图标 + 组件（活动栏/容器/拖拽/收起自动生效）。详见 `docs/节点搜索功能.md`。
- **预设管理面板**：左侧活动栏面板（id `'presets'`，图标 `ColorPaletteOutline`），集中管理节点/连线预设与分组：节点/连线 Tab 切换、分组下拉筛选（节点与连线分组独立）、序号徽标（1-9 快捷键提示，仅前 9 项）、可见列表内拖拽排序、新建/保存当前为预设（默认归入当前分组，弹层内可当场新建分组）、分组管理弹窗（内置"内置"分组不可删/改名）。浮动编辑器预设条（`FloatingColorStrip`）与面板同步，展示当前分组可见列表。详见 `docs/预设管理.md`。
- **项目文件（新建 / 保存 / 打开）**：JSON 带版本号（`.aidea.json`）序列化节点树+项目名+视图状态；序列化/解析纯函数 `utils/projectFile.ts`，编排层 `composables/useProjectFile.ts`。Chromium 用 File System Access API 记忆文件句柄（打开后 Ctrl+S 直接覆盖原文件），Safari/Firefox 回退下载/上传。dirty 经 `history` 写操作 → `utils/dirtyMarker` → `fileStore.dirty`。详见 `docs/项目文件.md`。
- **标签系统**：项目级标签定义（`stores/tags.ts` 的 `tags: Map<tagId, Tag={id,name,color}>`，随项目文件序列化，不入 localStorage）+ 节点内联 `tagIds: string[]`（与 `connections` 同模式，随子树迁移）。节点右下角渲染标签胶囊（数据色底 + WCAG 对比字，右对齐最多 4 个 + `+N` 溢出；`layoutLines`/`fitNodeToText` 用同一 `reservedBottom` 公式预留底部防文本重叠）。左侧标签管理面板（id `'tags'`，`PricetagsOutline`）行内色块用 `#trigger` 插槽小圆点（NColorPicker 根自带 `width:100%` 会撑满 flex 行），点击标签项（色点+名称主体）可给选中节点批量添加/移除该标签（toggle：全含则移除、否则添加，支持多选，各节点保留自有其它标签，走命令层可撤销；高亮分全含 active / 部分含 partial）；右侧属性面板「标签」区 `NSelect multiple` 打标签（多选时显示共同标签交集，批量写入）；搜索可按标签 AND 过滤。**快捷键**：`T + 1-9` —— 按住 t 时按数字，对选中节点批量添加/删除标签列表中对应序号标签（与纯数字 `1-9` 应用预设区分）。**撤销策略**：标签定义 CRUD 不可撤销（直接改 store + `markDataDirty`），仅「节点打标签」经 `useCommands.updateNodesTagsPerNode`（modify `tagIds`，按节点分别设置）可撤销，故不改 `history.ts`。消费 `tagIds` 处须用 `tagsStore.getTag(id)` 过滤悬空引用。详见 `docs/标签系统.md`。`parseProjectFile` 裁剪非存在标签 id 自愈。
- **AI 功能**：调用本地 Ollama（默认 `qwen2.5-coder:7b`）打印回复到控制台，**暂不渲染**。编排入口 `composables/useAIAssist.ts`：`runAIAssist()` 把当前视图 `buildNodeContext` 结构化上下文发给模型做发散；`runAIWordGeneration()` 取当前视图一层深度子级（`collectSubtree(targetId,{maxDepth:1})`）让模型生成 10 个词（换行分隔、无序号）。模型调用走 OpenAI 兼容 fetch 实现 `provider/openai.ts`（`createOpenAIProvider` + `AIError` 分级：timeout/network/auth/http/parse/not-implemented），配置 `stores/ai.ts`（localStorage 持久化），提示词与默认值在 `constants/ai.ts`。详见 `docs/AI功能.md`。
