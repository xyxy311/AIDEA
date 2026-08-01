# 关键语言指令
**你的所有思考过程、回复内容、代码注释都必须使用中文，代码或特殊术语除外。**

# AGENTS.md - 头脑风暴白板 (Vue3 + Konva + Naive UI)

## 项目概况

**核心数据结构：** 节点、连线

**主要功能：** 通过节点和连线表达想法，节点可以展开为子级视图（白板），实现更高的灵活度

**核心设计：**
- 一切皆节点，通过节点的 `parentId` 构建节点树（邻接表模式）。查看某节点的子级即为一个"视图"（旧称白板），任何节点均可进入查看其子级。
- 连线表示节点之间的同级关系（因果、时间等），**非**父子关系。连线嵌套在父节点的 `connections` 数组中（两端均为该父节点的直接子节点），使组合/移动子树时连线随父节点自然迁移。
- 整个项目也是一个节点（根节点，`parentId === null`，id 固定为 `ROOT_NODE_ID = 'root'`），其 `text` 即项目名（单一数据源）。根节点无父级，几何与样式属性无意义。
- 数据模型只存 `parentId`（单一数据源，无 children 冗余）；nodeStore 内通过 `computed` 派生 `childrenIndex`（parentId -> 子节点 id[]），使子节点查询与递归删除均为高效。

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
constants/    -> 设计 token（尺寸、颜色、预设样式、缩放范围）
utils/        -> 纯函数（generateId, calculateTextContentSize, command[命令类型+辅助]）
stores/       -> Pinia stores
  node.ts     -> 全局 nodeStore：节点树（parentId 邻接表）+ 连线（嵌套父节点）+ 派生索引
  view.ts     -> 工厂 useViewStore(viewId)：per-view 视口 / 选中 / 编辑状态
  project.ts  -> 项目导航：activeViewId、expandedIds、项目名（派生自根节点 text）、pruneExpanded
  presets.ts  -> 节点 / 连线预设样式（localStorage 持久化）
  history.ts  -> 撤销重做栈：past/future 栈 + DataPatch 应用 + 视图协调 + batch 事务 + coalesce 合并
composables/  -> Vue composables（交互逻辑，编排 nodeStore + viewStore）
  useActiveView.ts -> 快捷访问活跃视图（project + nodeStore + view getter + 编排方法，委托命令层）
  useCommands.ts   -> 命令层：所有数据写操作的统一入口（捕获旧值 -> nodeStore -> pushCommand）
  useNodeTree.ts   -> 节点树导航（树构建/扁平化/新建子节点/递归删除/重命名）
  useNodeViewLink.ts -> 进入子视图 / 组合 / 清空子级
components/
  canvas/     -> WhiteboardCanvas, WhiteboardNode, WhiteboardConnection, NodeTextEditor, OverviewMap
  toolbar/    -> Toolbar
  panels/     -> LeftSidebar(节点树), RightSidebar, NodePropertyEditor, ConnectionPropertyEditor, SettingsModal
  layout/     -> AppShell, MenuBar
```

### Store 架构（数据与视图状态分离）

**nodeStore（全局唯一，`defineStore('node')`）**：所有节点存于单一 `reactive(new Map())`，通过 `parentId` 构建树。连线嵌套在父节点的 `connections` 数组。`childrenIndex` 为 `computed` 派生索引（parentId -> 子节点 id[]），使 `childrenOf` / `descendantsOf` 免于遍历全表。所有操作按节点/连线 ID 进行，不感知"选中"概念--批量操作由调用方传入 ID 列表，便于未来 undo/redo 以命令封装。

**viewStore（工厂 `useViewStore(viewId)`）**：每个节点视图（viewId = 被查看的节点 ID）拥有独立 store 实例（`view-<viewId>`）。仅管理视图状态：视口（stageX/Y/Scale）、选中、编辑、连线创建中状态。**不存储任何节点/连线数据**。

**project store**：管理 `activeViewId`（当前查看哪个节点的子级）、`expandedIds`（节点树展开状态）、`projectName`（computed，派生自根节点 text）。viewStore 实例的销毁由 project 负责（`destroyView` / `destroyViews`）。`pruneExpanded(existingIds)` 用于 undo/redo 后清理已不存在的节点展开状态。

**history store（`defineStore('history')`）**：撤销/重做栈管理。维护 `past` / `future` 两个 `HistoryEntry[]` 栈（上限 50 步）。每个 entry 包含一个 `DataPatch`（节点变更 + 连线变更的 diff，非全量快照）。`applyPatch` 直接操作 nodeStore 已暴露的 `nodes` Map（绕过 nodeStore 业务逻辑如 `fitNodeToText`），实现精确状态恢复。`runWithViewCoord` 包裹数据操作，执行后统一处理视图协调（销毁被删节点的 viewStore、当前视图无效时沿 `pathToRoot` 回退到最近存在的祖先、清理 `expandedIds`）。支持 batch 事务（复合操作合并为单条历史）和 coalesce 合并（同 `coalesceKey` + 1s 时间窗口内的连续编辑合并为一条）。

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

**例外**：拖拽 mousemove 中的 `nodeStore.moveNode`（实时渲染，不入栈），mouseup 时调 `commands.commitNodeMove` 入栈。同理 `nodeStore.resizeNode` 在 `onTransformEnd` 中直接调用，mouseup 时调 `commands.commitNodeResize` 入栈。

**DataPatch 结构**：`{ nodeChanges: NodeChange[], connChanges: ConnectionChange[] }`。每个 change 为 `add` / `remove` / `modify` 类型。`modify` 只存变化字段（diff），非全量节点。`add` / `remove` 存完整节点/连线深拷贝。

**coalesce 合并**：属性面板连续输入（文本编辑、颜色拖拽）用 `coalesceKey` 标识，1s 内同 key 的连续 `modify` 合并为一条历史（保留首次 old、更新 new），使一次 undo 回到编辑前。

**batch 事务**：复合操作（如 Shift 连线创建 = 创建起始节点 + 创建连线）用 `beginBatch` / `commitBatch` / `rollbackBatch` 包裹，事务内所有 `pushCommand` 追加到同一 patch，`commitBatch` 时合并为单条历史。`rollbackBatch` 丢弃事务内的历史条目（不回滚已执行的 nodeStore 数据变更）。

### 数据流

```
Canvas 事件 -> composable 编排 -> 命令层 useCommands（捕获旧值 -> nodeStore -> pushCommand）
-> reactive(new Map()) 变更 -> childrenOf/getConnections computed -> v-for 重渲染
```

组合操作（`useNodeViewLink.groupSelectedNodes`）退化为同 nodeStore 内的树重 parenting：新建容器节点 + `reparentNode`（改 parentId）+ `moveConnections`（迁连线），纯单 store 数据变更，通过命令层入栈为复合 DataPatch。

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

### deepClone 与 undefined 字段

`utils/command.ts` 的 `deepClone` 用 `JSON.parse(JSON.stringify(toRaw(obj)))` 实现深拷贝。但 `JSON.stringify(undefined)` 返回 `undefined`（非字符串），`JSON.parse(undefined)` 会抛 `SyntaxError`。因此 `deepClone` 已对 `undefined` / `null` 做短路返回。

节点创建时不带 `textColor` / `backgroundColor` / `borderColor`（默认 `undefined`），而 `captureNodeFields` 对每个字段值单独调用 `deepClone`。若无短路保护，崩溃会发生在 `nodeStore.updateNodesStyle` **之前**，导致样式永远写不进去（连线字段创建时全有显式默认值，不受影响）。

同理，undo/redo 的 `applyPatch` 中 `modify` 类型不能简单用 `Object.assign(node, deepClone(target))`--`JSON.stringify` 会丢弃 `undefined` 属性，导致无法恢复 `undefined`。history store 的 `assignFields` 辅助函数逐一遍历 key，`undefined` 值 `delete` 属性，其余 `deepClone` 后赋值。

### 命令层约束

所有数据写操作**必须**通过 `useCommands` 的语义接口，不能直接调用 nodeStore 的写 action（`addNode` / `deleteNodes` / `setNodeText` / `updateNodesStyle` 等）。唯一例外是拖拽 mousemove 中的 `nodeStore.moveNode` 和 `onTransformEnd` 中的 `nodeStore.resizeNode`（实时渲染，不入栈），但 mouseup / transform-end 时必须调 `commands.commitNodeMove` / `commands.commitNodeResize` 入栈。

直接调用 nodeStore 写 action 会导致操作不进入历史栈，undo/redo 无法覆盖，产生不可逆变更。
