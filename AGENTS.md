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
| 状态 | `pinia` setup store | nodeStore（全局单例）+ viewStore（per-view 工厂）+ project |
| 工具 | `@vueuse/core`, `nanoid` | 窗口尺寸、ID 生成 |
| 测试 | `vitest` + `happy-dom` + `@vue/test-utils` | |

路径别名：`@/` -> `src/`（tsconfig paths + vite resolve alias 均已配置）

## 架构层次

```
types/        -> 纯接口（WhiteboardNode, Connection, NodeStyle, StageConfig 等）
constants/    -> 设计 token（尺寸、颜色、预设样式、缩放范围）
utils/        -> 纯函数（generateId, calculateTextContentSize）
stores/       -> Pinia stores
  node.ts     -> 全局 nodeStore：节点树（parentId 邻接表）+ 连线（嵌套父节点）+ 派生索引
  view.ts     -> 工厂 useViewStore(viewId)：per-view 视口 / 选中 / 编辑状态
  project.ts  -> 项目导航：activeViewId、expandedIds、项目名（派生自根节点 text）
  presets.ts  -> 节点 / 连线预设样式（localStorage 持久化）
composables/  -> Vue composables（交互逻辑，编排 nodeStore + viewStore）
  useActiveView.ts -> 快捷访问活跃视图（project + nodeStore + view getter + 编排方法）
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

**project store**：管理 `activeViewId`（当前查看哪个节点的子级）、`expandedIds`（节点树展开状态）、`projectName`（computed，派生自根节点 text）。viewStore 实例的销毁由 project 负责（`destroyView` / `destroyViews`）。

组件中通常通过 `useActiveView()` 统一访问：

```typescript
// composables/useActiveView.ts
const { project, nodeStore, view } = useActiveView()
// `view` 是 getter--每次访问指向当前活跃视图的 store 实例
// 切换视图后自动指向新的 store，无需手动重取
// 另有编排方法：updateSelectedNodesStyle / deleteSelectedNodes 等（选中 <-> 数据）
```

数据与视图状态分离，使撤销重做只需快照 nodeStore，而视图状态（选中/视口）不进入 undo 栈。

### 数据流

```
Canvas 事件 -> composable 编排 -> nodeStore actions（数据）/ viewStore actions（视图状态）
-> reactive(new Map()) 变更 -> childrenOf/getConnections computed -> v-for 重渲染
```

组合操作（`useNodeViewLink.groupSelectedNodes`）退化为同 nodeStore 内的树重 parenting：新建容器节点 + `reparentNode`（改 parentId）+ `moveConnections`（迁连线），纯单 store 数据变更。

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
