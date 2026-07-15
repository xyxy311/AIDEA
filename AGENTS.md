# AGENTS.md — 头脑风暴白板 (Vue3 + Konva)

## 常用命令

```
npm run dev          # Vite HMR 开发服务器（无需手动重启）
npm run test         # vitest run（--passWithNoTests）
npm run type-check   # vue-tsc --noEmit
npm run build        # type-check → vite build
```

验证标准：`npm run type-check` 零错误 + `npm run test` 全绿。**不需要启动 dev server 或打开浏览器**——agent 无法验证 Canvas 渲染。

## 技术栈

| 层 | 选型 | 用途 |
|----|------|------|
| 渲染 | `konva` + `vue-konva` (v3) | Canvas 画布，`v-` 前缀组件 |
| 状态 | `pinia` setup store | `shallowRef<Map>` + `triggerRef` |
| 工具 | `@vueuse/core`, `nanoid` | 窗口尺寸、ID 生成 |
| 测试 | `vitest` + `happy-dom` + `@vue/test-utils` | |

路径别名：`@/` → `src/`（tsconfig paths + vite resolve alias 均已配置）

## 架构层次

```
types/        → 纯接口（WhiteboardNode, StageConfig 等）
constants/    → 设计 token（尺寸、颜色、默认值）
utils/        → 纯函数（generateId, clampPosition, measureText）
stores/       → Pinia store（whiteboard.ts — 唯一 store）
composables/  → Vue composables（useStageSize, useKeyboardShortcuts, useCanvasEvents）
components/   → Vue SFC
  canvas/     → WhiteboardCanvas, WhiteboardNode, NodeTextEditor
  toolbar/    → Toolbar
  layout/     → AppShell
```

数据流：`Toolbar/Canvas events → store actions → shallowRef<Map> 变更 → triggerRef → nodesArray computed → v-for 重渲染`


补充：

```
types/                  → 仅仅定义数据结构，不提供方法
stores/whiteboard.ts    → 唯一 store，管理节点和画布的状态，提供节点操作（添加、删除、移动、选择、修改等等），仅用来进行数据操作，和图形无关  
composables/            → 处理鼠标键盘交互以及导航逻辑等等，直接操作 store
canvas/WhiteboardCanvas.vue → 连接事件和组件
```


## 关键陷阱

### Store 响应式：shallowRef + computed 的引用相等问题

Store 用 `shallowRef<Map>` 存储节点，修改节点属性后调用 `triggerRef(nodes)` 触发更新。但 Map 中节点对象**引用不变**，Vue 的 `computed` 默认按 `===` 比较新旧值，若返回同一引用则跳过通知下游。

```typescript
// ❌ 错误 —— 返回同一对象引用，下游 computed 不重新计算
const node = computed(() => store.nodesArray.find(n => n.id === props.nodeId))

// ✅ 正确 —— 展开为新对象，引用每次不同
const node = computed(() => {
  const found = store.nodesArray.find(n => n.id === props.nodeId)
  return found ? { ...found } : undefined
})
```

凡是从 `store.nodesArray` / `store.selectedNode` 读取后需要驱动下游渲染的地方，**必须展开为新对象**。

### Konva 事件冒泡

Konva shape 上的事件会冒泡到 Stage。Stage 上绑定的 `@click` / `@dblclick` 处理器**必须**过滤：

```typescript
function handleStageDblClick(e: KonvaEventObject<MouseEvent>) {
  if (e.target !== e.currentTarget) return  // 点击在 shape 上，忽略
  // 只在空白画布上创建节点
}
```

### 文本编辑器

`NodeTextEditor` 是 DOM `<textarea>` 覆盖层（非 Canvas 绘制），绝对定位在 Konva Stage 上方。Enter 保存时会触发组件卸载 → textarea blur → 二次 save。编译器用 `saved` 布尔守卫 + `setTimeout(0)` 延迟 blur 处理来防止竞态。

### vue-konva v3 ref 模式

```typescript
const rectRef = ref<VueKonvaRef<Konva.Rect> | null>(null)
// 获取底层 Konva 实例：
rectRef.value?.getNode()
```

### 渲染不可验证

本项目的正确性**只能由人类在浏览器中验证**。Agent 的"完成"标准是 `type-check + test` 双绿，不应启动 dev server 或尝试浏览器自动化。
