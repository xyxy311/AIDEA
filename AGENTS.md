# 关键语言指令
**你的所有思考过程、回复内容、代码注释都必须使用中文，代码或特殊术语除外。**

# AGENTS.md — 头脑风暴白板 (Vue3 + Konva + Naive UI)

## 常用命令

```
npm run dev          # Vite HMR 开发服务器
npm run test         # vitest run --passWithNoTests
npm run type-check   # vue-tsc --noEmit
npm run build        # vue-tsc --noEmit && vite build
```

验证标准：`npm run type-check` 零错误 + `npm run test` 全绿。**不要启动 dev server**——agent 无法验证 Canvas 渲染。

## 技术栈

| 层 | 选型 | 用途 |
|----|------|------|
| 渲染 | `konva` + `vue-konva` v3 | Canvas 画布，`v-` 前缀组件 |
| UI | `naive-ui` + `@vicons/ionicons5` | 工具栏、侧边栏、弹窗等 UI chrome |
| 状态 | `pinia` setup store | 多实例 store（每个白板一个） |
| 工具 | `@vueuse/core`, `nanoid` | 窗口尺寸、ID 生成 |
| 测试 | `vitest` + `happy-dom` + `@vue/test-utils` | |

路径别名：`@/` → `src/`（tsconfig paths + vite resolve alias 均已配置）

## 架构层次

```
types/        → 纯接口（WhiteboardNode, NodeStyle, WhiteboardData, StageConfig 等）
constants/    → 设计 token（尺寸、颜色、预设样式、缩放范围）
utils/        → 纯函数（generateId, clampPosition, measureText）
stores/       → Pinia stores
  project.ts  → 项目元数据：项目名、白板列表、活跃白板 ID
  whiteboard.ts → 工厂函数 useWhiteboardStore(id)：每个白板的节点 CRUD + 视口状态
composables/  → Vue composables（交互逻辑，直接操作 store）
components/
  canvas/     → WhiteboardCanvas, WhiteboardNode, NodeTextEditor, OverviewMap
  toolbar/    → Toolbar
  panels/     → LeftSidebar, RightSidebar, NodePropertyEditor, PresetStyles, SettingsModal
  layout/     → AppShell
  shared/     → 共享组件（当前为空）
```

### Store 架构（多实例模式）

`whiteboard.ts` 的 `useWhiteboardStore(id)` 是一个**工厂函数**——每次调用为指定白板创建独立的 Pinia store 实例（`whiteboard-<id>`）。同一 id 多次调用返回同一实例。`project.ts` 管理多个白板的索引。

组件中通常不直接调用 `useWhiteboardStore(id)`，而是通过 `useActiveWhiteboard()`：

```typescript
// composables/useActiveWhiteboard.ts
const { project, board } = useActiveWhiteboard()
// `board` 是 getter——每次访问指向当前活跃白板的 store 实例
// 切换白板后自动指向新的 store，无需手动重取
```

销毁白板时（`project.removeWhiteboard`），需手动从 Pinia 内部 Map 中删除该 store 实例：`pinia._s.delete('whiteboard-<id>')`。

### 数据流

`Toolbar/Canvas 事件 → store actions → shallowRef<Map> 变更 → triggerRef → nodesArray computed → v-for 重渲染`

## 关键陷阱

### Store 响应式：shallowRef + computed 的引用相等问题

Store 用 `shallowRef<Map>` 存储节点，修改节点属性后调用 `triggerRef(nodes)`。Map 中节点对象**引用不变**，Vue 的 `computed` 默认按 `===` 比较，若返回同一引用则跳过下游通知。

凡是从 `store.nodesArray` / `store.selectedNode` 读取后需要驱动下游渲染的地方，**必须展开为新对象**：

```typescript
// ❌ 错误 —— 返回同一对象引用，下游 computed 不重新计算
const node = computed(() => store.nodesArray.find(n => n.id === props.nodeId))

// ✅ 正确 —— 展开为新对象，引用每次不同
const node = computed(() => {
  const found = store.nodesArray.find(n => n.id === props.nodeId)
  return found ? { ...found } : undefined
})
```

### Konva 事件冒泡

Konva shape 上的事件会冒泡到 Stage。Stage 上绑定的 `@click` / `@dblclick` 处理器**必须**过滤：

```typescript
function handleStageDblClick(e: KonvaEventObject<MouseEvent>) {
  if (e.target !== e.currentTarget) return  // 点击在 shape 上，忽略
  // 只在空白画布上创建节点
}
```

### 文本编辑器

`NodeTextEditor` 是 DOM `<textarea>` 覆盖层（非 Canvas 绘制），绝对定位在 Konva Stage 上方。Enter 保存时会触发组件卸载 → textarea blur → 二次 save。用 `saved` 布尔守卫 + `setTimeout(0)` 延迟 blur 处理来防止竞态。

### vue-konva v3 ref 模式

```typescript
const rectRef = ref<VueKonvaRef<Konva.Rect> | null>(null)
// 获取底层 Konva 实例：
rectRef.value?.getNode()
```

### 渲染不可验证

本项目的正确性**只能由人类在浏览器中验证**。Agent 的"完成"标准是 `type-check + test` 双绿。
