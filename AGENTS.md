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

## 项目目录

```
types/      纯接口
constants/  设计 token：尺寸/几何/节点连线数据色与预设样式/缩放范围
utils/      纯函数（generateId, calculateTextContentSize, command, reference[引用名提取/片段解析/布局]）
config/     配色 colorSchemes.ts：亮/暗（Naive theme + overrides + CSS 变量 + 画布 chrome 色）
locales/    UI 文本 zh-CN.json（i18n 占位层）
stores/     node(全局树+连线+派生索引 childrenIndex/referenceIndex/tagIndex) / tags(项目级标签定义) / view(工厂，视口/选中/编辑，不存数据)
            / project(导航+快照+销毁内联实例) / presets / history(undo+patch+batch+coalesce) / theme / layout(活动栏顺序/激活)
components/  canvas(/CanvasStage/WhiteboardNode/Connection/OverviewMap/InlineView*/TextAutocomplete) / topbar(顶部按钮逻辑组件 OpenButton/SaveButton/UndoButton/RedoButton/SettingsButton/DebugButton/GridButton/AddNodeButton) / panels(left:NodeTreePanel/ReferencesPanel/SearchPanel/PresetManagerPanel/TagsPanel
             / right:NodePropertyEditor/ConnectionPropertyEditor/PropertyPanel) / layout(ActivityBar/LeftTopBar/RightTopBar/AppShell/LeftSidebar/RightSidebar) / common(可复用通用件 DockPanel/DockContainer/DraggableSortList/TopBarZone—顶部通用容器/TopBarButton—通用按钮模板/WheelScroll/NodeItem)
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
- **活动栏**：图标序列渲染 `layout.panels`（顺序受拖拽 reorder 影响），元信息从 `PANEL_CATALOG` 解析（`constants/panels.ts`：id/icon/titleKey/component + `defaultPlacement`）。新增面板只需在品类表登记。
- **收起/展开主要经活动栏**：点击图标 = `layout.togglePanel(id)`（同 id → 收起，激活由 `activePanelId` 驱动，null=收起）；左侧面板 × = 收起（`collapse`，不移除面板），右侧 dock 面板 × = 移除到「未放置」（`removePanel`，经活动栏「+」恢复）。面板统一由 `DockPanel` 外壳提供标题栏/图标/关闭/拖拽手柄，面板组件本身**无 header**。
- **拖拽排序**：HTML5 drag（dragstart/dragover/drop）调 `layout.reorder`；`dragstart` 置 `suppressClick`、`dragend` 用 `setTimeout(0)` 复位，抑制拖拽后误触 click 切换面板。内存态，不持久化。
- layout store：`panels`（顺序）/`activePanelId`/`lastPanelId`（收起后 `expand()` 恢复）/`togglePanel`/`setActive`/`reorder`/`collapse`/`expand`。
- 新增面板只需在 `constants/panels.ts` 品类表登记，活动栏图标、面板容器、拖拽排序、展开/收起自动生效。

### 可拖拽面板与左右侧边栏（dock）

- **右侧是多面板 dock**（PS/Blender 式）：`RightSidebar` 外壳内渲染 `DockContainer`，垂直堆叠多个 `DockPanel`；面板间有可上下拖拽的 resize handle 调整高度比例，面板可拖拽换位、可关闭。
- **通用外壳 `DockPanel`**：`common/DockPanel.vue`（唯一面板包裹层，两侧共用）：标题栏显隐 `showHeader`、活动栏图标（从品类表 `PANEL_INDEX` 读，与 ActivityBar 同源）、标题（品类表 `titleKey`，可用 `title` prop 覆盖）、关闭按钮 `showClose`、拖拽手柄 `draggable`、滚动 `NScrollbar x-scrollable`。面板内容组件由品类表 `component` 提供（纯内容，无自带 header）。左侧 `LeftSidebar` 与右侧 `DockContainer` 均只放 `<DockPanel :panel-id="...">`。
- **面板纯化**：`panels/` 下面板为纯内容组件，**不携带 header/hideHeader/title**；标题、图标、关闭、拖拽全由外层 `DockPanel` 提供。
- **左右互通**：面板可在左侧（活动栏/单面板区）与右侧（dock）之间拖拽移动。统一 HTML5 drag 协议由 `utils/dock.ts` 的 `PANEL_DRAG_MIME`/`writePanelDrag`/`readPanelDrag` 提供（dataTransfer 携带 `{panelId, from:'left'|'right'}`，MIME `aidea-panel`）：右侧面板拖到活动栏 → `moveToLeft`；活动栏图标/左侧面板拖到右侧 dock → `moveToRight`。活动栏底部「+」可把未放置面板加回左侧。
- **layout store**：`rightPanels`（右侧顺序）/`rightSizes`（各面板 flex 比例）/`moveToLeft`/`moveToRight`/`reorderRight`/`setRightSize`/`removePanel`/`resetDock`。纯状态转换在 `utils/dock.ts`（可单测）。默认左右面板由品类表 `defaultPlacement` 派生（不硬编码）。归属/顺序/高度持久化到 localStorage，设置「恢复默认布局」一键重置。
- **delta 排布模型**：localStorage 只存「用户显式改动」（顺序覆盖 / 跨侧移动 / 关闭 = `removed` / 尺寸），渲染目录 = `deriveDockLayout(uiRegistry 登记表, delta)` 实时派生（`layout.leftPanels`/`rightPanels`/`unplacedPanels`）；新增内置面板 / 插件注册自动按默认侧出现，恢复默认 = 清空 delta。
- 详见 `docs/可拖拽面板与左右侧边栏.md`。

### 顶部图标条（LeftTopBar + RightTopBar）

- 原「菜单栏 MenuBar / 工具栏 Toolbar」更名为 **`LeftTopBar` / `RightTopBar`**，顶部一条纯图标栏 `.top-bar`：左侧 `LeftTopBar` + 右侧 `RightTopBar`，`space-between` 左右分开（新建节点 primary 最右最醒目）。
- **按钮注册机制（模仿侧边栏品类表）**：全量品类表 `constants/topbar.ts`（`TOP_BAR_CATALOG`，含 `id/titleKey/defaultZone/component`），按钮逻辑组件位于 `components/topbar/`。新增顶部按钮只需登记品类表 + 提供对应按钮组件，左/右顶部条、拖拽排序、跨区放置、默认布局自动生效。
- **通用按钮模板 `TopBarButton`**（`common/TopBarButton.vue`）：唯一按钮外壳，统一 tooltip / active（底部主色条）/ primary（主色填充）/ disabled / split-button 下拉菜单；各按钮只提供 `icon/title/disabled/active/variant/menu` 与 `@click`。
- **通用容器 `TopBarZone`**（`common/TopBarZone.vue`）：按 `layout` store 某侧顺序（`leftTop`/`rightTop`）渲染已注册按钮 + 同侧拖拽排序（`layout.reorderTop`）/ 跨区放置（`layout.moveTopZone`，写入 `utils/topbar.ts` 的 `TOP_DRAG_MIME` 数据）；`dragstart` 置 `suppressClick`、`dragend` 用 `setTimeout(0)` 复位。`LeftTopBar`/`RightTopBar` 是固定 zone 的薄封装。
- 顺序与归属持久化到 `localStorage`（`aidea-top-left` / `aidea-top-right`），只存用户显式顺序覆盖（delta），渲染目录 = `deriveTopLayout(uiRegistry 登记表, delta)` 实时派生（`layout.topLeft`/`topRight`），新增按钮自动出现；设置「恢复默认布局」调用 `layout.resetDock()`（内含 `resetTopBar`）。
- 文件操作经 `inject('projectFile')`（AppShell 注入单实例）；设置按钮直接 `useModalStore().open(SETTINGS_MODAL_KEY)`（modal store 全局单例，无注入间接层）；撤销/重做经 `commands.undo()/redo()` 按 `canUndo/canRedo` 禁用。
- 详见 `docs/顶部栏按钮注册与拖拽.md`。

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
- **面板使用案例**：`PresetManagerPanel`（预设列表，开启序号徽标）、`TagsPanel`（标签列表，关闭徽标）。
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
详见 docs/ 目录下的中文名文档