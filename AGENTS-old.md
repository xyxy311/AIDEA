# 关键语言指令
**你的所有思考过程、回复内容、代码注释都必须使用中文，代码或特殊术语除外。**

# AGENTS.md - 头脑风暴白板 (Vue3 + Konva + Naive UI)

## 项目概况

**核心结构：** 节点、连线、视图

**主要功能：** 通过节点和连线表达想法，节点可以展开为子级视图（白板），实现更高的灵活度

**核心设计：**
- 一切皆节点，通过节点的 `parentId` 构建节点树（邻接表模式）。查看某节点的子级即为一个"视图"（旧称白板），任何节点均可进入查看其子级。
- 连线表示节点之间的同级关系（因果、时间等），非父子关系。连线嵌套在父节点的 `connections` 数组中（两端均为该父节点的直接子节点），使组合/移动子树时连线随父节点自然迁移。
- 整个项目也是一个节点（根节点，`parentId === null`，id 固定为 `ROOT_NODE_ID = 'root'`），其 `text` 即项目名（单一数据源）。根节点无父级，几何与样式属性无意义。
- 数据模型只存 `parentId`（单一数据源，无 children 冗余）；nodeStore 内通过 `computed` 派生 `childrenIndex`（parentId -> 子节点 id[]），使子节点查询与递归删除均为高效。
- 节点可"展开为内联视图"：主视图中为该节点绘制矩形宿主框架，内容区用**独立 Konva Stage**（DOM 覆盖层）渲染该节点的子级画布，实现"画布内嵌画布"。详情见下文"内联视图架构"。
- 节点引用：`#` 开头定义可引用名（text 去 `#` 第一行 trim），`@名 ` 引用他人（主色高亮+下划线，点击切换到该节点子视图）。重名禁止（先到先得）。nodeStore 的 computed 派生 `referenceIndex`（name -> nodeId，惰性缓存，单一数据源 text）；useCommands 文本写入加重名校验返回 `{ok, conflictRef}`，冲突不写不入栈；@ 补全经 useReferenceAutocomplete + TextAutocomplete（画布双击编辑器 + 属性面板）。

## 常用命令

```
npm run dev          # Vite HMR 开发服务器
npm run test         # vitest run --passWithNoTests
npm run type-check   # vue-tsc --noEmit
npm run build        # vue-tsc --noEmit && vite build
```

验证标准：`npm run type-check` 零错误 + `npm run test` 全绿。**不要启动 dev server**--agent 无法验证 Canvas 渲染。

## 技术栈

| 层 | 选型 | 用途 |
|----|------|------|
| 渲染 | `konva` + `vue-konva` v3 | Canvas 画布，`v-` 前缀组件 |
| UI | `naive-ui` + `@vicons/ionicons5` | 工具栏、侧边栏、弹窗等 UI chrome |
| 状态 | `pinia` setup store | nodeStore（全局单例）+ viewStore（per-view 工厂）+ project + history |
| 工具 | `@vueuse/core`, `nanoid` | 窗口尺寸、ID 生成 |
| 测试 | `vitest` + `happy-dom` + `@vue/test-utils` | |

路径别名：`@/` -> `src/`（tsconfig paths + vite resolve alias 均已配置）

## 架构层次

```
types/        -> 纯接口（WhiteboardNode, Connection, NodeStyle, StageConfig 等）
constants/    -> 设计 token（尺寸、几何、节点/连线数据色与预设样式、缩放范围）。UI chrome 色已迁至 config/colorSchemes
utils/        -> 纯函数（generateId, calculateTextContentSize, command[命令类型+辅助], reference[引用名提取/片段解析/布局]）
config/       -> 配色方案 colorSchemes.ts（亮/暗：Naive UI theme + overrides + CSS 变量 + 画布 UI chrome 色）
locales/      -> UI 文本资源 zh-CN.json（按模块分组，i18n 占位）
stores/       -> Pinia stores
  node.ts     -> 全局 nodeStore：节点树（parentId 邻接表）+ 连线（嵌套父节点）+ 派生索引
  view.ts     -> 工厂 useViewStore(viewId)：'main'（常驻，viewedNodeId 可变）/ 内联实例（viewedNodeId 固定）；视口 / 选中 / 编辑 / inlineViews
  project.ts  -> 项目导航：activeViewId 固定 'main'、currentNodeId、viewSnapshots 快照存取、expandedIds、destroyView（只销毁内联实例）
  presets.ts  -> 节点 / 连线预设样式（localStorage 持久化）
  history.ts  -> 撤销重做栈：past/future 栈 + DataPatch 应用 + 视图协调（含内联视图清理）+ batch 事务 + coalesce 合并
  theme.ts    -> 主题状态（isDark/scheme/toggle，useColorMode 持久化，watchEffect 注入 CSS 变量到 :root）
composables/  -> Vue composables（交互逻辑，编排 nodeStore + viewStore）
  useActiveView.ts -> 快捷访问活跃主视图（'main'）--仅主视图上下文（组件）使用
  useCommands.ts   -> 命令层：所有数据写操作的统一入口（捕获旧值 -> nodeStore -> pushCommand）
  useNodeTree.ts   -> 节点树导航（树构建/扁平化/新建子节点/递归删除/重命名）
  useNodeViewLink.ts -> 进入子视图/父视图 / 组合 / 清空子级
  useReferenceAutocomplete.ts -> @ 引用补全共享逻辑（画布编辑器 + 属性面板）
  useT.ts         -> 轻量文本访问 t()（i18n 占位层，未来迁移 vue-i18n 调用方零改动）
components/
  canvas/     -> CanvasStage（通用画布组件，viewId/allowExpand/showOverviewMap/width/height props）
                 WhiteboardCanvas（主视图薄壳：useKeyboardShortcuts + CanvasStage viewId='main'）
                 WhiteboardNode, WhiteboardConnection, NodeTextEditor, OverviewMap, TextAutocomplete（@ 补全下拉）
                 InlineViewFrame（内联视图宿主框架：标题栏+边框矩形，v-group name=nodeId）
                 InlineViewCanvas（内联视图 DOM 覆盖层：坐标同步，内嵌 CanvasStage）
  toolbar/    -> Toolbar
  panels/     -> LeftSidebar(节点树), RightSidebar, NodePropertyEditor, ConnectionPropertyEditor, SettingsModal
  layout/     -> AppShell, MenuBar
```

### Store 架构（数据与视图状态分离）

**nodeStore（全局唯一，`defineStore('node')`）**：所有节点存于单一 `reactive(new Map())`，通过 `parentId` 构建树。连线嵌套在父节点的 `connections` 数组。`childrenIndex` 为 `computed` 派生索引（parentId -> 子节点 id[]），使 `childrenOf` / `descendantsOf` 免于遍历全表；`referenceIndex` 为 `computed` 派生索引（引用名 -> nodeId，惰性缓存，单一数据源 text，见"节点引用"）。所有操作按节点/连线 ID 进行，不感知"选中"概念--批量操作由调用方传入 ID 列表，便于未来 undo/redo 以命令封装。

**viewStore（工厂 `useViewStore(viewId, init?)`）**：viewId 区分两类实例--`'main'` 主视图常驻，切换查看节点通过改 `viewedNodeId`（不重建实例）；其他值 = 内联视图实例，`viewedNodeId` 首次初始化后固定，`hostViewId` 指向宿主视图。仅管理视图状态：视口（stageX/Y/Scale）、选中、编辑、连线创建中、内联视图列表（`inlineViews` + `addInlineView` / `removeInlineView` / `updateInlineViewSize` / `getInlineViewRect`）。**不存储任何节点/连线数据**。

**project store**：`activeViewId` 固定为 `'main'`（主视图常驻），`currentNodeId` 派生自主视图 `viewedNodeId`。维护 `viewSnapshots`（Map<nodeId, ViewSnapshot>，切走时保存/恢复各节点独立导航状态，含内联视图快照）与 `switchView(id)`（保存当前快照 -> 销毁全部内联实例 -> 改 viewedNodeId -> 恢复目标快照）。`expandedIds`（节点树展开状态）、`projectName`（computed，派生自根节点 text）。viewStore 实例销毁由 project 负责（`destroyView` / `destroyViews`，`'main'` 永不销毁，只销毁内联实例）。`pruneExpanded(existingIds)` 用于 undo/redo 后清理已不存在的节点展开状态。

**history store（`defineStore('history')`）**：撤销/重做栈管理。维护 `past` / `future` 两个 `HistoryEntry[]` 栈（上限 50 步）。每个 entry 包含一个 `DataPatch`（节点变更 + 连线变更的 diff，非全量快照）。`applyPatch` 直接操作 nodeStore 已暴露的 `nodes` Map（绕过 nodeStore 业务逻辑如 `fitNodeToText`），实现精确状态恢复。`runWithViewCoord` 包裹数据操作，执行后统一处理视图协调（销毁宿主节点已被删除的内联视图实例、当前视图无效时沿 `pathToRoot` 回退到最近存在的祖先、清理 `expandedIds`）。支持 batch 事务（复合操作合并为单条历史）和 coalesce 合并（同 `coalesceKey` + 1s 时间窗口内的连续编辑合并为一条）。

组件中通常通过 `useActiveView()` 统一访问：

```typescript
// composables/useActiveView.ts
const { project, nodeStore, view } = useActiveView()
// `view` 是 getter--每次访问指向当前活跃视图的 store 实例
// 切换视图后自动指向新的 store，无需手动重取
// 编排方法（updateSelectedNodesStyle / deleteSelectedNodes 等）委托命令层执行
```

数据与视图状态分离，使撤销重做只需记录 nodeStore 的 diff（DataPatch），而视图状态（选中/视口）不进入 undo 栈。

### 撤销重做架构（三层）

```
交互层（composables / components）
    ↓ 调用语义接口
命令层 useCommands.ts
    ↓ 捕获旧值 -> 调用 nodeStore action -> 构造 DataPatch -> pushCommand
数据层 nodeStore（reactive Map） / project（视图协调）
```

**命令层（`useCommands`）**是所有数据写操作的统一入口。每个语义接口（`createNode` / `deleteNodes` / `setNodeText` / `updateNodesStyle` / `commitNodeMove` / `commitNodeResize` / `addConnection` / `groupNodes` 等）内部完成：捕获旧值 -> 调用 nodeStore action -> 构造 `DataPatch` -> `history.pushCommand`。

**例外**：拖拽 mousemove 中的 `nodeStore.moveNode`（实时渲染，不入栈），mouseup 时调 `commands.commitNodeMove` 入栈。同理 `nodeStore.resizeNode` 在 `onTransformEnd` 中直接调用，mouseup 时调 `commands.commitNodeResize` 入栈。**内联视图矩形缩放是视图状态**：onTransformEnd 中直接调 `view.updateInlineViewSize`（不入 undo，undo/redo 不覆盖）。

**DataPatch 结构**：`{ nodeChanges: NodeChange[], connChanges: ConnectionChange[] }`。每个 change 为 `add` / `remove` / `modify` 类型。`modify` 只存变化字段（diff），非全量节点。`add` / `remove` 存完整节点/连线深拷贝。

**coalesce 合并**：属性面板连续输入（文本编辑、颜色拖拽）用 `coalesceKey` 标识，1s 内同 key 的连续 `modify` 合并为一条历史（保留首次 old、更新 new），使一次 undo 回到编辑前。

**batch 事务**：复合操作（如 Shift 连线创建 = 创建起始节点 + 创建连线）用 `beginBatch` / `commitBatch` / `rollbackBatch` 包裹，事务内所有 `pushCommand` 追加到同一 patch，`commitBatch` 时合并为单条历史。`rollbackBatch` 丢弃事务内的历史条目（不回滚已执行的 nodeStore 数据变更）。

### 数据流

```
Canvas 事件 -> composable 编排 -> 命令层 useCommands（捕获旧值 -> nodeStore -> pushCommand）
-> reactive(new Map()) 变更 -> childrenOf/getConnections computed -> v-for 重渲染
```

组合操作（`useNodeViewLink.groupSelectedNodes`）退化为同 nodeStore 内的树重 parenting：新建容器节点 + `reparentNode`（改 parentId）+ `moveConnections`（迁连线），纯单 store 数据变更，通过命令层入栈为复合 DataPatch。

### 内联视图架构（DOM 覆盖层渲染）

节点可"展开为内联视图"：主视图中为该节点绘制矩形宿主框架，内容区用**独立 Konva Stage**（DOM 覆盖层）渲染该节点的子级画布。仅允许 1 层嵌套（内联视图内不再展开），内联视图不渲染小地图。

**viewId 语义（viewStore 工厂）**：
- `'main'`：单一主视图实例，常驻不销毁。切换查看的节点通过改 `viewedNodeId` 实现（不重建实例）。
- 其他值：内联视图实例（`type === 'inline'`），`viewedNodeId` 首次初始化后固定，`hostViewId` 指向宿主视图。

**渲染分层**：主视图 = 常驻单 Stage（WhiteboardCanvas 薄壳 -> CanvasStage viewId='main'）。每个内联视图 = 独立 Stage，渲染在 InlineViewCanvas（DOM `<div>` 覆盖层）内，内嵌 CanvasStage（viewId = 内联视图 ID）。CanvasStage 无主视图/内联特判，差异全靠 props（`viewId` / `allowExpand` / `showOverviewMap` / `width` / `height`）。

**事件隔离**：浏览器按 DOM 层级分发事件。内联视图 DOM 覆盖层只覆盖矩形内容区（标题栏下方），标题栏保留在主 Stage 上可交互，天然无串扰。宿主节点用 `InlineViewFrame`（v-group，`name` 设为节点 ID）替代 WhiteboardNode 渲染，使拖拽 / 选中 / 连线 / 双击等交互经 `findNodeIdFromTarget` 原样复用--标题栏拖拽即拖拽宿主节点。

**坐标同步**：InlineViewCanvas 通过 ResizeObserver 测量容器实际渲染尺寸，容器样式 = 宿主节点世界坐标 × 宿主 stageScale + 宿主 stage 偏移，top 再偏移标题栏高度（`INLINE_VIEW_TITLE_HEIGHT`）。容器内独立 Stage 用容器宽高作 stage 尺寸（CanvasStage props.width/height）。

**展开 / 收起**：右键菜单（仅主视图、单选节点时）提供"展开 / 收起内联视图"（useCanvasEvents）。展开 = `generateId()` 生成内联 viewId -> `useViewStore(viewId, { nodeId, type: 'inline', hostViewId })` -> `view.addInlineView(nodeId, viewId, w, h)`。收起 = `project.destroyView(iv.viewId)` + `view.removeInlineView(nodeId)`。二者均为**视图操作，不入 undo 栈**。

**有效尺寸**：内联矩形尺寸存 viewStore 的 inlineViews 项（width/height，视图状态），经 `getInlineViewRect(nodeId)` 读取。onTransformEnd 分叉：内联视图节点 -> `view.updateInlineViewSize`（不入 undo）；普通节点 -> `commands.commitNodeResize`（入栈）。

**视图切换（快照记忆）**：`project.switchView(id)` = 保存当前节点快照（视口/选中/编辑/连线/内联视图列表）-> 销毁当前全部内联视图实例 -> 改 `viewedNodeId` -> 恢复目标节点快照（含按快照重建内联视图实例）。切走销毁、切回重建，任意时刻仅一套内联实例存活。

**边界清理**：`runWithViewCoord` 执行数据操作后，销毁宿主节点已被删除的内联视图实例（`mainView.inlineViews` 中 `!afterIds.has(iv.nodeId)` 的项）并从 inlineViews 移除；当前节点无效时沿 pathToRoot 回退。

**mouseup 提窗**：鼠标移入内联视图 DOM 覆盖层后，主 Stage 收不到 stage mouseup。三个 composable（useNodeDragging / useMarqueeSelection / useConnectionCreation）在 handleMouseDown 接管后注册一次性 `window.addEventListener('mouseup', onWindowMouseUp, { once: true })` 兜底（拖拽提交移动 / 框选取消 / 连线回滚取消），stage mouseup 已处理时幂等返回。

### 多语言架构（i18n 占位层）

**资源文件**：`src/locales/zh-CN.json`，按功能模块分组（menuBar / toolbar / settings / nodeEditor / connectionEditor / leftSidebar / rightSidebar / canvas / common），与组件目录对齐。支持 `{name}` 形参插值（如 `"nodeCount": "节点：{count}"`）。

**访问层**：`src/composables/useT.ts` 导出 `t(key, params?)`，非 composable（无响应式依赖），可在 `<script setup>` 和普通 `.ts`（composable / store）中直接 import 调用。未命中 key 时回退返回 key 本身（便于发现遗漏）。

**约束**：所有用户可见的 UI 文本（按钮、标签、placeholder、确认弹窗、右键菜单、空状态等）**必须**通过 `t()` 访问，禁止硬编码中文字符串。新增 UI 文本时同步加 JSON key。

**未来迁移**：引入 vue-i18n 时，只需把 `useT.ts` 内部实现替换为 vue-i18n 的 `t`，调用方零改动；JSON 资源结构直接兼容。locale 切换与主题切换相互独立，无耦合。

### UI 配色与主题架构

**两类颜色严格区分**：
- **UI chrome 色**（随主题变）：画布背景、Transformer 选中框、框选矩形、临时 / 选中连线高亮。定义在 `src/config/colorSchemes.ts` 的 `ColorScheme.canvas`，通过 `themeStore.scheme.canvas.*` 响应式绑定到 Konva config。
- **节点 / 连线数据色**（不随主题变）：`DEFAULT_NODE_STYLE`、`PRESET_STYLES`、`DEFAULT_NODE_PRESETS`、`DEFAULT_CONNECTION_PRESETS`、`CONNECTION_STROKE_COLOR`、`PLACEHOLDER_TEXT_COLOR`。仍存于 `constants/index.ts`，属于用户内容（节点保持白色卡片，类似 Excalidraw / Figma 深色模式）。

> 新增 UI chrome 色加入 `config/colorSchemes`；新增节点 / 连线数据色加入 `constants`。

**配色方案**：`src/config/colorSchemes.ts` 定义 `colorSchemes = { light, dark }`，每个 `ColorScheme` 含四部分：
- `theme` -- Naive UI 主题（`null` = 亮 / `darkTheme` = 暗）
- `naiveOverrides` -- `GlobalThemeOverrides`（主色等组件级覆盖）
- `cssVars` -- 注入 `:root` 的 `--color-*` 变量（供自定义组件 `var(--color-bg)` 使用）
- `canvas` -- Konva 画布 UI chrome 色（响应式绑定到 shape config）

架构可扩展--加 sepia / 高对比度只需新增一个 `ColorScheme` 对象并扩展 `useColorMode` 的 `modes`。

**themeStore（`src/stores/theme.ts`）**：单一数据源驱动三处：
1. **Naive UI** -- `App.vue` 的 `NConfigProvider` 读 `scheme.theme` / `scheme.naiveOverrides`，`NGlobalStyle` 同步 body 背景。
2. **CSS 变量** -- `watchEffect` 将 `scheme.cssVars` 注入 `:root`，自定义组件通过 `var(--color-bg)` 等自动跟随（`main.css` 不再定义颜色变量）。
3. **Konva 画布** -- 组件读 `scheme.canvas.*` 绑定到 Konva shape config，Vue 响应式触发重绘。

`mode` 由 `@vueuse/core` 的 `useColorMode` 管理，持久化到 `localStorage('aidea-theme')`，仅 light / dark 两态手动切换（默认浅色）。`isDark` / `scheme` 为 `computed`。切换通过 `toggle()` / `setMode()`。设置面板的深色模式 `NSwitch` 绑定 `theme.isDark` + `theme.toggle`。

**自定义组件色值约束**：`<style scoped>` 中**禁止**硬编码十六进制色值，必须用 `var(--color-surface)` / `var(--color-border)` / `var(--color-text)` 等 CSS 变量，否则深色模式下不跟随。

## 关键陷阱

### reactive(Map) 深度响应式

nodeStore 用 `reactive(new Map())`（**非** shallowRef）。Map 的增删触发响应式，Map 中节点对象（含 `connections` 数组）也是深度代理--修改 `node.connections.push(...)` 会自动触发响应式。从 `childrenOf` / `getConnections` 读取后驱动渲染的 computed 会建立精确依赖（仅 `parentId` 关系变化才重算 `childrenIndex`，修改 text/样式不触发）。

### Konva 事件冒泡

Konva shape 上的事件会冒泡到 Stage。Stage 上绑定的 `@click` / `@dblclick` 处理器**必须**过滤：

```typescript
function handleStageDblClick(e: KonvaEventObject<MouseEvent>) {
  if (e.target !== e.currentTarget) return  // 点击在 shape 上，忽略
  // 只在空白画布上创建节点
}
```

### 文本编辑器

`NodeTextEditor` 是 DOM `<textarea>` 覆盖层（非 Canvas 绘制），绝对定位在 Konva Stage 上方。Enter 保存时会触发组件卸载 -> textarea blur -> 二次 save。用 `saved` 布尔守卫 + `setTimeout(0)` 延迟 blur 处理来防止竞态。

### vue-konva v3 ref 模式

```typescript
const rectRef = ref<VueKonvaRef<Konva.Rect> | null>(null)
// 获取底层 Konva 实例：
rectRef.value?.getNode()
```

### 渲染不可验证

本项目的正确性**只能由人类在浏览器中验证**。Agent 的"完成"标准是 `type-check + test` 双绿。

### 内联视图 DOM 覆盖层与 stage 事件

内联视图是叠在主 Stage 之上的 DOM 元素，鼠标移入覆盖层后主 Stage 不再收到 mousemove / mouseup：
- 拖拽 / 框选 / 连线创建必须注册 window mouseup 兜底（见上文"mouseup 提窗"），否则交互状态卡死。
- 覆盖层必须只覆盖矩形内容区（标题栏下方），标题栏留给主 Stage 交互。
- 覆盖层内独立 Stage 的事件在容器内正常冒泡，不受主 Stage 影响。

### 命令层约束

所有数据写操作**必须**通过 `useCommands` 的语义接口，不能直接调用 nodeStore 的写 action（`addNode` / `deleteNodes` / `setNodeText` / `updateNodesStyle` 等）。唯一例外是拖拽 mousemove 中的 `nodeStore.moveNode` 和 `onTransformEnd` 中的 `nodeStore.resizeNode`（实时渲染，不入栈），但 mouseup / transform-end 时必须调 `commands.commitNodeMove` / `commands.commitNodeResize` 入栈。

直接调用 nodeStore 写 action 会导致操作不进入历史栈，undo/redo 无法覆盖，产生不可逆变更。

### 主题响应式与 Konva config

从 `themeStore.scheme.canvas.*` 取的颜色必须处于**响应式上下文**中：要么在 `computed` 内，要么在 template 绑定中。若直接赋值给普通 `const` config 对象，切换主题时不会重算（如 `transformerConfig` 必须是 `computed`）。检查方式：搜索 `scheme.canvas` 的引用点，确认其外层是 `computed` 或 template 绑定。

### UI 文本与主题的独立访问层

- 文本：所有用户可见字符串**必须**经 `t()`（`@/composables/useT`），禁止硬编码中文。
- 色值：自定义组件 `<style scoped>` **禁止**硬编码十六进制色，必须用 `var(--color-*)`；Konva 画布 UI chrome 色必须读 `themeStore.scheme.canvas.*`（响应式上下文内）。
