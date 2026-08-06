# AGENTS.md - 头脑风暴白板 (Vue3 + Konva + Naive UI)

**所有回复、思考、代码注释必须使用中文（代码或特殊术语除外）。**

## 核心概念

- **一切皆节点**：经 `parentId` 构建树（邻接表），查看某节点子级即一个"视图"。
- **连线表示同级关系**，非父子关系，嵌套在父节点 `connections` 中随父迁移。
- **根节点**（`parentId === null`，id 固定 `'root'`）即整个项目，`text` 即项目名（单一数据源），几何与样式无意义。
- 数据只存 `parentId`，nodeStore 用 `computed` 派生 `childrenIndex`。
- **内联视图**：节点展开后用独立 Konva Stage（DOM 覆盖层）渲染子级画布，实现"画布内嵌画布"。

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
utils/      纯函数（generateId, calculateTextContentSize, command）
config/     配色 colorSchemes.ts：亮/暗（Naive theme + overrides + CSS 变量 + 画布 chrome 色）
locales/    UI 文本 zh-CN.json（i18n 占位层）
stores/     node(全局树+连线+派生索引) / view(工厂，视口/选中/编辑，不存数据)
            / project(导航+快照+销毁内联实例) / presets / history(undo+patch+batch+coalesce) / theme
composables/ useActiveView / useCommands(数据写统一入口) / useNodeTree / useNodeViewLink / useT
components/  canvas(/CanvasStage/WhiteboardNode/Connection/OverviewMap/InlineView*) / toolbar / panels / layout
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