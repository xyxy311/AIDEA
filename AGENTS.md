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
stores/     node(全局树+连线+派生索引 childrenIndex/referenceIndex) / view(工厂，视口/选中/编辑，不存数据)
            / project(导航+快照+销毁内联实例) / presets / history(undo+patch+batch+coalesce) / theme / layout(活动栏顺序/激活)
composables/ useActiveView / useCommands(数据写统一入口) / useNodeTree / useNodeViewLink / useReferenceAutocomplete / useT
components/  canvas(/CanvasStage/WhiteboardNode/Connection/OverviewMap/InlineView*/TextAutocomplete) / toolbar / panels(left:NodeTreePanel/ReferencesPanel
             / right:NodePropertyEditor/ConnectionPropertyEditor) / layout(ActivityBar/MenuBar/AppShell)
             / floating(/FloatingPropertyEditor / FloatingColorStrip / FloatingPresetEditor — Word 风格浮动属性编辑器)
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
- 引用面板（ReferencesPanel）：`#` = 引用定义符号，`@名` = 在别处引用。双击编辑保留 `#` 前缀与正文（`pendingBody` 暂存非首行拼回）。

### 内联视图（DOM 覆盖层渲染）

- `'main'` 常驻；其他值 = 内联实例（viewedNodeId 固定，hostViewId 指向宿主），仅 1 层嵌套，不渲染小地图。
- 每个内联视图 = 独立 Stage，渲染在 InlineViewCanvas（DOM `<div>` 覆盖层）内；CanvasStage 差异全靠 props，无主视图特判。
- 覆盖层只覆盖矩形内容区（标题栏下方），标题栏保留在主 Stage；宿主节点用 InlineViewFrame 替代渲染。
- 坐标：容器样式 = 宿主世界坐标 × 宿主 stageScale + 宿主偏移，top 再偏移标题栏高度。
- 展开/收起为视图操作（右键菜单，仅主视图），不入 undo。
- `project.switchView(id)` = 存快照 -> 销毁全部内联实例 -> 改 viewedNodeId -> 恢复快照。任意时刻仅一套内联实例存活。
- 三个 composable（useNodeDragging / useMarqueeSelection / useConnectionCreation）须注册 window mouseup 兜底（覆盖层阻断 stage 事件）。

### 浮动属性编辑器（Word 风格浮层）

- 归属整个应用，**不做视图判定**：只要主视图全局选中（`mainView.selectedNodeIds/selectedConnectionIds.size > 0`）即弹出，Teleport 到 body + `position:fixed`，避免被 `overflow:hidden` 裁切。
- 挂载点：`AppShell.vue` 单实例 `<FloatingPropertyEditor />`；逻辑在 `composables/useFloatingPropertyEditor.ts`。
- **锚点**：先解析选中项在哪个视图渲染（`resolveRenderView(parentId)`：`mainView.inlineViews` 中 `nodeId === parentId` 的内联视图，否则主视图），用该视图 `containerEl.getBoundingClientRect()` + stage 变换换算屏幕坐标（内联视图额外乘宿主缩放）。节点=顶部居中上方；连线=两端节点中心中点。`translate(-50%,-100%)` 居中偏上 + 视口 8px 夹取。
- **拖动**：头部为把手（pointer + `setPointerCapture`），`offset` ref 记录位移，最终位置 = 锚点 + offset + 夹取。**无位置记忆**：`watch(selectionKey)` 选中变化时 offset 归零，每次重锚定。
- **面板固定宽度 300px**（非内容撑开）：横条 `NScrollbar x-scrollable` 用 `flex:1; min-width:0` 占满可用宽并在面板内滚动，避免预设增多撑宽面板、滚动条不可见。
- **半透明**：鼠标不在面板上时 `.is-dimmed { opacity: 0.25 }`（`@mouseenter/@mouseleave` 切 `isHovered`），移入恢复。
- **拖拽节点时隐藏**：`useNodeDragging.ts` 导出模块级共享信号 `globalIsDraggingNode`（激活置 true、`cleanupDragState` 置 false），`hasSelection` 并入 `&& !globalIsDraggingNode.value`。拖拽激活期间面板以 `v-if` 隐藏，结束自动恢复。
- 选中节点：自由改色（NColorPicker，hex+alpha）+ 节点预设横条（纯色圆点）；选中连线：自由改色（hex）+ 连线预设横条（迷你线段小样，点击应用完整预设）+ 线型 `NSelect` + 粗细 `NInputNumber(show-button)` + 有向 `NCheckbox`（**非 NSwitch**）。
- 预设横条：`+` 添加、右键色块弹 ContextMenu（编辑/删除），共用 presetsStore（与右侧边栏同源）。文案进 `floatingEditor` locale 段。

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
- **浮动面板宽度固定**：`.float-editor` 用固定 `width: 300px` 而非内容撑开，否则预设增多会把面板撑宽、横条滚动条不可见。横条滚动需 `NScrollbar` 且色块 `flex-shrink:0`、内容行 `width:max-content`。
- **浮动面板显隐**：全局共享的 `globalIsDraggingNode` 信号驱动"拖拽节点时隐藏面板"；面板是 DOM 覆盖层，点击其上控件不冒泡到 Konva stage，不会清选中。