# AGENTS.md - 头脑风暴白板 (Vue3 + Konva + Naive UI)

## 关于项目

名称：AIDEA。详见 `docs/项目功能介绍.md`。

## 命令与验证

```
npm run test         # 测试
npm run build        # 构建（已包括类型检查）
```

每次改动的完成标准：`test` 全绿 + `build` 无错误（注意：DSH 下需要请求更高权限运行这两个命令，否则会因为沙箱环境报错）。渲染正确性由人工验证。

## 技术栈

`konva` + `vue-konva` v3（`v-` 前缀）｜`naive-ui` + `@vicons/ionicons5`｜`pinia` setup store｜`@vueuse/core`、`nanoid`｜vitest + happy-dom。别名 `@/` -> `src/`。

## 项目目录

```
types/      纯接口
constants/  设计 token：尺寸/几何/节点连线数据色与预设样式/缩放范围
utils/      纯函数（generateId, calculateTextContentSize, command, dock, topbar, reference, grid, color, nodePath）
config/     配色 colorSchemes.ts（亮/暗 + 主色，见 docs/主题与配色.md）
locales/    UI 文本 zh-CN/en-US.json（i18n 占位层，见 docs/多语言.md）
stores/     node / tag / view / project / additions / presets / history / theme / layout / file / uiRegistry / modal
composables/useCommands（命令层）/ useActiveView / useT / 画布交互
components/  canvas（WhiteboardCanvas/WhiteboardNode/WhiteboardConnection/CanvasStage/InlineView*/Overviews/…，见 docs/画布与渲染.md）
             topbar（按钮逻辑组件） / panels（左侧/右侧面板，纯内容） / layout（ActivityBar/AppShell/Sidebars） / common（通用件，见 docs/基础组件.md）
```

组件通常经 `useActiveView()` 统一访问 nodeStore / project / view。

## 核心架构（详见 docs/ 各文档）

| 子系统 | 一句话 | 详见 |
| --- | --- | --- |
| 撤销重做 | 数据写统一经 `useCommands`：捕获旧值→store→`DataPatch`→入栈；支持 coalesce/batch | `命令层与撤销重做.md` |
| 画布与渲染 | 主/内联视图共用 `CanvasStage`，内联视图是 DOM 覆盖层渲染；拖动无连线节点可插入连线（A→B 变 A→C→B） | `画布与渲染.md` |
| 面板与侧边栏 | delta 排布模型：登记表回答问题，localStorage 只存用户改动，实时派生目录 | `可拖拽面板与左右侧边栏.md` |
| 顶部栏 | 品类表 `TOP_BAR_CATALOG` 登记 + `TopBarZone` 渲染 | `顶部栏按钮注册与拖拽.md` |
| 预设样式 | presets store 单一数据源，节点/连线分组完全独立，1-9 随筛选联动 | `预设管理.md` |
| 基础组件 | common 通用件（DockPanel/TopBarButton/DraggableSortList/…） | `基础组件.md` |
| 主题与配色 | themeStore 单一数据源驱动 Naive/CSS 变量/Konva；分 chrome 色与数据色 | `主题与配色.md` |
| 多语言 | 轻量 i18n 占位层：`t()` + createT 工厂，禁止硬编码中文 | `多语言.md` |
| 插件系统 | 适配层是稳定 SDK（只增不改）；load-collection 是唯一可变点 | `插件系统.md` |
| 插件 UI 注册 | uiRegistry 品类表驱动面板/按钮；`${pluginId}:${id}` 键规范化 | `插件UI注册.md` |
| 插件模态面板 | 插件面板经 DockPanel 外包错误边界；浮窗/模态外壳 | `插件模态面板.md` |

## 主要模块连接

- **入口**：`main.ts` 装 Pinia + VueKonva → `App.vue`（NConfigProvider 注入主题/多语言）→ `AppShell`（唯一布局外壳，注册侧边栏/画布并 `provide('projectFile')`）。插件在 `main.ts` 里经 `usePluginStore().init()` 引导装载。
- **数据流（单向）**：交互层（组件）→ `useCommands`（唯一写入口）→ nodeStore/project → `history` 入栈；undo/redo 由 history 反向恢复。只读用 `useActiveView()`。
- **视图状态**：`view` store 是工厂（每视图一实例：主 + 多个内联），`viewedNodeId`/`stageScale`/选中态；`project` 管导航/快照/`switchView`。
- **面板/按钮**：`panels`/`topbar` 品类表登记 → `uiRegistry` 目录 → `layout` store 读 delta 实时派生渲染目录 → `ActivityBar`/`LeftTopBar`/`RightTopBar`/`DockContainer` 渲染。
- **插件接入**：插件经 `PluginAdapter`（唯一出入口）→ 命令层/各域 api → `uiRegistry` 注册 UI → 布局自动派生；`PluginModalHost`/`PluginFloatingHost` 承载模态/浮窗。
- **主题/多语言**：themeStore 单一数据源 → Naive UI + CSS 变量 + 画布 chrome 色；UI 文本经 `useT` 的 `t()`。
- **项目文件**：`projectFile`（AppShell 注入）→ fileStore + 命令层载入/保存；登录态/快照由 `project` store 维护。

## 编码要求

**非常重要！**：
- 编代中要注意是否存在相似重复的代码，并考虑能否优化和重构。
- 要谨慎编写过于复杂的代码，并考虑能否简化
- 要保持注释简明，只保留关键注释，不要加入过多的解释内容（除了文件开头）。
- 编码后不立即更新文档，但是需要提醒用户更新文档。

## 注意事项

- **命令层约束**：数据写操作必须经 `useCommands`，不能直接调 nodeStore 写 action（否则不进历史栈）。Exception：拖拽/缩放实时渲染的 `moveNode`/`resizeNode` 不入栈，结束事件 `commit*` 入栈。
- **reactive(Map) 深度响应式**：nodeStore 用 `reactive(new Map())`（非 shallowRef）。依赖 `childrenOf`/`getConnections` 的 computed 只随 parentId 关系变化重算。
- **主题响应式**：`scheme.canvas.*` 色值必须在响应式上下文（computed/template）使用，不能赋给普通 const config。
- **文本与颜色独立访问**：UI 文本经 `t()`（见 `多语言.md`）；自定义组件色值用 `var(--color-*)`，Konva chrome 色读 `themeStore.scheme.canvas.*`（见 `主题与配色.md`）。
- **复用约定**：面板纵向可拖拽排序列表优先复用 `DraggableSortList`（见 `基础组件.md`）；新增面板登记 `constants/panels.ts` 品类表，按钮登记 `constants/topbar.ts`。

## 其它
详见 `docs/` 目录下的文档。