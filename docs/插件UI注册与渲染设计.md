# 插件 UI 注册与渲染设计（Plugin UI Registration & Rendering）

> 本文是 `docs/插件系统设计.md` 的细化，专讲**主程序如何加载插件注册的自定义 UI 组件并渲染**。
> 覆盖三类：**新面板（panel）**、**顶栏功能按钮（topBarButton）**、**设置栏目（settingsCategory）**。
> 前提：插件 `setup(ctx)` 经由**适配层 `ctx.adapter`** 注册这些 UI（Phase 2 增量）；加载方式（当前 Vite 编译期 `collectPluginEntries`，未来 Electron 运行时动态载入）对本文所述机制**不可见**。

---

## 一、目标与边界

- **注册的是一等公民**：插件面板与内置面板地位等价（左侧 ∪ 右侧 ∪ 未放置三态），参与拖拽换位、顺序与归属持久化、关闭、活动栏「+」添加。
- **稳定层原则**：`registerPanel / registerTopBarButton / registerSettingsCategory` 是 SDK 的一部分，**只增不改**。渲染内核只认 `pluginId:key` 路由，不持有任何编译期模块引用。
- **可迁移性原则**：注册的是**运行时组件对象**，不在任何持久化里存放模块引用；控件 id 落存 localStorage 后凭 id 重构。切运行时加载时，组件对象改由动态 import 的模块给出，注册与渲染零改动。
- **渲染不破坏主程序**：任一插件组件渲染/回调抛错都必须被隔离，不得传染主应用。

---

## 二、核心概念：组件是「运行时对象」，持久化只存 id

> 横切原则 A 规定"所有插件能力均通过插件 id 路由，不携带编译期模块引用语义"。这可能与"注册一个 Vue 组件对象"表面冲突，特作澄清：

- **持久化层**（`aidea-dock-*` / `aidea-top-*`、插件启停清单）**从不存组件引用**，只存归一化后的 `pluginId:key` 字符串 id。
- **内存注册表**（reactive）存**运行时组件对象**：该对象由插件在 `setup` 时经 `ctx.adapter.ui.register*` 现场传入，来源是"加载的模块"（编译期 `import.meta.glob` 的打包模块，或未来运行时 `import()` 的模块）。内核不 `import` 插件代码，只**接收** setup 传入的对象。
- 重启后：`localStorage` 里只躺 id → `PluginManager` 经装载收集（`collectPluginEntries`）重新发现 → `setup` 重新注册 → 注册表重建对象引用 → 合并层按 id 还原渲染。**同一份 id + 同一套机制对两种加载方式逐字成立。**

因此「不携带编译期模块引用」的准确含义是：**内核/持久化不得有硬编码的模块 import 或模块 id → 组件 的全局映射**；而 setup 时现场传递的运行时对象在这一语义下是合法的，也是 Vue 组件在运行时必然的存在形态。

---

## 三、SDK 形态：`adapter.ui`

在 `src/types/plugin.ts` **追加**（只增不改，`SDK_VERSION` 仍为 `'0'`，本轮即 v0 首次发布此 UI 面）：

```ts
// ---- 新增：插件 UI 注册类型 ----

/** 插件面板：与内置面板同约束（纯内容组件，无自带 header/hideHeader/title） */
export interface PluginPanelRegistration {
  id: string                 // 插件内短 id，注册表内归一为 `${pluginId}:${id}`
  title: string              // 纯字符串标题（见 §3.1）
  icon: Component            // ionicons 同款形态（Vue 图标组件）
  component: Component       // 面板内容组件（复用 built-in 纯化约定）
  defaultPlacement?: 'left' | 'right'   // 默认放置侧，缺省 'right'
}

/** 插件顶栏按钮：描述符，主程序经 TopBarButton 外壳渲染 */
export interface PluginTopBarButtonRegistration {
  id: string                 // 归一为 `${pluginId}:${id}`
  title: string              // tooltip 文案
  icon: Component
  onClick: () => void        // 渲染侧统一 try/catch
  zone?: TopBarZone          // 'left'|'right'，缺省 'left'
  variant?: 'default' | 'primary'
  disabled?: () => boolean   // 惰性取值函数（渲染期实时求值）
  menu?: TopBarMenuOption[]  // 可选 split-button 下拉（复用 TopBarButton）
}

/** 插件设置栏目：与内置 Settings Section 同形态（纯内容，import settings-shared.css） */
export interface PluginSettingsCategoryRegistration {
  id: string                 // 归一为 `${pluginId}:${id}`
  title: string
  component: Component
}

export interface PluginUiApi {
  registerPanel(entry: PluginPanelRegistration): void
  registerTopBarButton(entry: PluginTopBarButtonRegistration): void
  registerSettingsCategory(entry: PluginSettingsCategoryRegistration): void
}

export interface PluginAdapter {
  readonly sdkVersion: string
  readonly api: PluginApi
  readonly ui: PluginUiApi    // ★新增
}
```

`PluginContext.adapter` 不变；`createPluginAdapter()`（`src/plugin/adapter.ts`）在既有 `api` 旁组装 `ui`（惰性委托给 `stores/plugin.ts` 注册表，见 §四）。

### 3.1 标题为何用纯字符串而不用 `titleKey`

内置面板用 `titleKey` → `t()`（`DockPanel.vue:54` / `ActivityBar.vue:78`）。插件**无法在编译期向 `zh-CN.json` 注入 key**；且 `t()` 未命中时回退 key 本身（`useT.ts:30`），语义上等于纯字符串。插件可自行在 `title` 里做多语言（读 `localStorage('aidea-plugin-config.<id>')` 或自带字典）。`DockPanel` 的 `title` prop 已支持字符串覆盖（`DockPanel.vue:54` `props.title ?? t(meta.titleKey)`），渲染层对其直接透传即可。

### 3.2 icon 形态

与内置一致为 Vue 组件（@vicons/ionicons5 或插件自带内联 SVG——如 `panels.ts` 中 `references` 的内联图标）。未来运行时加载的插件内 import 图标亦为其模块产出的对象，机制不变。

---

## 四、注册表（内核，reactive）

新增 `src/stores/plugin.ts`（pinia setup store，与现有结构一致）：

```ts
state:
  panelEntries: Map<string, PluginPanelEntry>      // key = `${pluginId}:${id}`，含 pluginId 回溯
  topBarEntries: Map<string, PluginTopBarButtonEntry>
  settingsEntries: Map<string, PluginSettingsEntry>

actions:
  register*(…): void         // 归一 key → 冲突检查 → 写入（冲突拒注册返回 false）
  unregisterByPlugin(pluginId: string): void       // setup 抛错回滚 / 错误恢复时按插件批量清除
  / / 由 PluginManager 统一调用，插件不直接碰本 store
```

- 用 `reactive(new Map())`（沿用 nodeStore 惯例，深度响应式），`computed` 派生 `pluginPanelKeys()` 等。
- **冲突拒注册**：key 与内置 id 天然不冲突（内置 id 不含 `:`）；与其它插件注册项冲突 → `setup` 记 `error` 并在插件管理面板提示。
- 注册动作**只经 PluginManager**（`src/plugin/manager.ts`）调：保证处于 activating/active 态、id 归一、冲突校验、注册顺序记录（供回滚）。

---

## 五、合并层（渲染集成的唯一改动集中点）

新增 `src/plugin/uiMerge.ts`（纯函数 + composable），把内置目录表与插件注册表合并为**派生目录**与解析器，供四个渲染点使用。目标是：**渲染组件只依赖这一个新入口，不改业务拿目录逻辑**。

```ts
// 内置 panel 元信息（从 PanelDef 映射）+ 插件 panel 注册项
export interface PanelMeta {
  id: string
  titleKey?: string          // 内置才有
  title?: string             // 插件才有（字符串覆盖）
  icon: Component
  component: Component
  defaultPlacement: 'left' | 'right'
  pluginId?: string          // 标记插件来源（错误边界/隔离用）
}

export function useMergedPanelIndex(): ComputedRef<Record<string, PanelMeta>>   // 内置优先，插件兜底
export function usePanelMeta(id: string): ComputedRef<PanelMeta | undefined>
export function useMergedPanelCatalog(): ComputedRef<PanelMeta[]>               // 内置在前，插件在后
```

同构导出 `topBar`（`useMergedTopBarIndex` / `useMergedTopBarCatalog`）与 `settings`（`useSettingsCategories`：内置 + 分隔线 + 插件）三套。内置均在插件前（id 含 `:` 保证不撞，顺序确定）。

**渲染点改造清单**（均改「查目录」这步，不动业务组件）：

| 位置 | 现状 | 改为 |
| --- | --- | --- |
| `DockPanel.vue:51` | `PANEL_INDEX[props.panelId]` | `usePanelMeta(props.panelId)`；`panelId` prop 类型 `PanelId` → `PanelId \| PluginPanelKey` |
| `DockPanel.vue:54/75/91` | `meta.titleKey / meta.icon / meta.component` | 标题解析改为 `props.title ?? meta.title ?? t(meta.titleKey)`；icon/component 不变 |
| `ActivityBar.vue:25-29` | `layout.panels.map(id => PANEL_CATALOG.find(id))` | `useMergedPanelCatalog()` 渲染；`!!p` 过滤保留（未注册的插件 id 在此被隐去） |
| `ActivityBar.vue:70-83`「+」列表 | `PANEL_CATALOG.filter(未放置)` | `useMergedPanelCatalog()`；label 用 `meta.title ?? t(meta.titleKey)` |
| `TopBarZone.vue:130` | `TOP_BAR_INDEX[id].component` | `useMergedTopBarIndex()[id]`（插件为 `wrapTopBarButton` 包装产物，见 §六） |
| `SettingsModal.vue` | 内置 `categories[]` + `sections{}` 扁平渲染 | 内置 + **分隔线** + 插件分组（见 §七） |
| `AppShell / LeftSidebar / RightSidebar / DockContainer` | 无直接解析 | 仅类型放宽，逻辑不改 |

> `PANEL_CATALOG / PANEL_INDEX / TOP_BAR_CATALOG / TOP_BAR_INDEX` 保留为「内置目录表」，**不再作为渲染直连接口**（渲染统一走合并层）。文档注释标注「内置固定集」。

---

## 六、顶栏按钮：描述符 → 等价逻辑组件

- 内置按钮是「逻辑组件」{ id, titleKey, zone, component }，经 `TopBarButton` 外壳渲染（`TopBarZone.vue:130`）。
- 插件注册的是**描述符**（icon/title/onClick/variant/disabled/menu）。为让 `TopBarZone` **零改动**，在注册表或 uiMerge 内用一个内部工厂把它包成等价逻辑组件：

```ts
// plugin/uiMerge.ts（内部）
function wrapTopBarButton(entry: PluginTopBarButtonEntry): Component {
  return defineComponent({
    setup() {
      return () => h(TopBarButton, {
        icon: entry.icon,
        title: entry.title,
        variant: entry.variant,
        disabled: entry.disabled?.(),
        menu: entry.menu,
        onClick: () => { /* try/catch entry.onClick() */ },
      })
    },
  })
}
```

- `disabled` 为惰性函数，渲染期实时求值（与内置按钮的 computed disabled 语义对齐）。
- onClick 错误 → `console.error` + 记录插件 warning，**不**卸载插件、不置 error 态（交互失败不等同于系统故障）。

---

## 七、设置栏目：内置 + 分隔线 + 插件分组

- 当前 `SettingsModal.vue` sidebar 是扁平 `v-for`。设计：把渲染改为「**内置组** → 分隔线 → **插件组**」。
- 数据源：`useSettingsCategories()` 返回 `{ builtin, plugin }` 分组；内置保持 `SettingsCategoryId` 封闭联合不动；插件组置于其后，头部渲染一条分隔线（沿用 `my-plan.md:6`"用分隔线隔开"的约定）。
- 右侧内容区 = 合并表解析组件；插件 Section 组件外包 `PluginErrorBoundary`（见 §九），并 `provide('aidea-plugin-adapter', adapter)` 供插件组件 `inject`。

---

## 八、布局持久化与归一化（顺序 / 归属）

插件面板参与 `aidea-dock-left/right/sizes` 与拖拽换位，**与内置同规则**；但归一化的合法性判定需对插件**特判**。

### 8.1 现状（事实）

- `normalizeDockState`（`utils/dock.ts:75`）用 `registry = PANEL_CATALOG 全部 id`（`layout.ts:63`）判合法，**非合法 id 一律剔除**；补默认只认 `defaults`（内置 `DEFAULT_LEFT/RIGHT_PANELS`）。
- `layout.ts:78-89` 实例化时以「目录表全集」归一化。
- `normalizeTopBarState`（`utils/topbar.ts:39`）同上：未知 id 丢弃、`defaults` 缺项末尾补。

### 8.2 设计：合法集合 = 内置 ∪ **已发现**插件 id（而非已注册）

关键改动：归一化的合法 id 集合扩大到 `内置 id ∪ discoveredPluginPanelKeys`。`collectPluginEntries()` 在启动时**同步**可得全部插件（含未启用），故 discovery 集合在归一化前就绪。

这一判断带来三个想要的边界行为：

| 场景 | 布局持久化 | 渲染表现 |
| --- | --- | --- |
| 插件**禁用**（重启生效） | id **保留**（归一化判为合法） | 未注册 → 合并目录不含 → `ActivityBar` 过滤隐藏 |
| 插件**重新启用** | 位置/顺序原样保留 | 注册后合并目录恢复 → 位置还原 |
| 插件**彻底移除**（源码删除） | id **剔除**（不在 discovered 集合） | — |

> 反之若用「已注册」判合法，禁用一次插件其布局记录即被清掉，违背可迁移初心的"装/卸不伤数据"。**渲染端始终用合并目录的可渲染集合过滤，不污染持久化层。**

### 8.3 首次出现归属（ensurePanel）

插件面板**没有内置的 `defaultPlacement` defaults 可被 normalize 补**。对应机制改为：`PluginManager` 注册面板成功后调用新增的 `layout.ensurePanel(id, placement)`（幂等）：

- 若该 id 尚未出现在 `leftPanels`/`rightPanels` 任一侧 → 按其 `defaultPlacement` 追加到对应侧末尾；右侧同时补 `rightSizes[id] = 1`。
- 已存在则不动（保护用户拖拽过的位置）。
- 顶栏按钮同理：注册成功调 `layout.ensureTop(zone, id)` 追加到该 zone 末尾（若缺席）。复用 `normalizeTopBarState` 的"补默认末尾"通道达同一效果亦可，但 ensureTop 更内聚。

职责划分：**normalize 负责"剔除彻底移除、保留已发现（含禁用）"；注册时 ensurePanel/ensureTop 负责"首次加入"。** 二者互补、幂等。

---

## 九、错误隔离（渲染）

所有插件 UI 渲染必须包一层 `PluginErrorBoundary.vue`（`src/components/plugin/`）：

- 基于 `onErrorCaptured`，捕获 → 显示「插件「{name}」组件出错」占位，阻断向上冒泡，**不崩溃主应用**。
- 使用位置：`DockPanel` 内容 `<component :is>`（仅插件源 panelMeta 时包裹）、`SettingsModal` 插件 Section、`TopBarButton` onClick 已 try/catch（无需边界组件）。
- 边界组件 `provide('aidea-plugin-adapter', pluginStore.adapterOf(id))`，插件组件经 `inject('aidea-plugin-adapter')` 取能力（SDK 约定，避免直 import store）。

---

## 十、时序与异步（装载 → 注册 → 渲染）

```
app mount
 ├─ PluginManager.init()
 │   ├─ collectPluginEntries() ──► discovered ids（编译期 glob 同步）→ 供 layout 归一化 known ids
 │   ├─ 读 localStorage('aidea-plugins') → enabled 集合
 │   └─ 依次（manifest 顺序，确定性）：
 │        loader() → m.default → 校验 manifest(id/sdkVersion)
 │        → setup({ adapter, manifest, onDispose })
 │        │    └─ adapter.ui.register* / adapter.api.*
 │        ├─ 注册项写入 reactive 注册表
 │        ├─ 面板→layout.ensurePanel(id,placement)；按钮→layout.ensureTop(zone,id)
 │        └─ setup 抛错 → 回滚已注册项 → 插件 error 态（隔离，不影响其它插件）
 └─ 合并层 computed 随注册自动更新 → ActivityBar/Dock/TopBar/Settings 渲染出新条目
```

- 插件 setup 在 mount 后**异步**执行：首次渲染可能短暂无插件条目，因活动栏图标即出现，**无需骨架屏**。
- 多插件注册顺序 = manifest 收集顺序，追加确定性。
- **HMR（dev）**：glob 打包的插件模块无 accept 时，Vite 默认触发整页 reload → 插件重新激活，即已可用的 dev 体验；不做细粒度 hot 重注册（标注 Phase 2 可选增强）。

---

## 十一、生命周期与注册项清理

- **无运行期卸载**：禁用/启用统一重启生效（主文档 §4.4 / §8.1），不存在 `active → deactivating` 的动态卸载转移。
- `unregisterByPlugin(pluginId)`：仅在 **setup 抛错回滚 / 错误恢复**时，按插件批量删除 reactive 表项（合并层自动收窄，UI 立即消失）。任一步抛错只置该插件 `error` 态。
- **setup 半程抛错回滚**：注册时按顺序记录，抛错后逆序删，避免半激活插件残留 UI。

---

## 十二、类型层面改动清单

| 类型 | 现状 | 改动 |
| --- | --- | --- |
| `PanelId` | 封闭联合 `'nodeTree'|...|'ai'` | 新增 `PluginPanelKey = \`${string}:${string}\``；DockPanel `panelId` prop、layout store actions 参数放宽为 `PanelId \| PluginPanelKey`（存储本就是 string 数组，不改结构） |
| `TopBarId` | 封闭联合 9 个 | 同样放宽为 `TopBarId \| PluginTopBarKey`（TopBarZone prop、`topOrder/reorderTop/moveTopZone` 参数、`TopBarDragData.buttonId`） |
| `SettingsCategoryId` | 封闭联合 4 个 | **不改**（保持内置封闭集合，设置弹窗内部用合并视图） |
| `PluginAdapter` | `{ sdkVersion, api }` | 追加只读 `ui: PluginUiApi` |

---

## 十三、安全与约定（沿用主文档 §十）

- 同源信任：插件组件在应用内树渲染，理论上可直 import/store，但 SDK 文档要求只用 `ctx.adapter` 能力；`aidea-plugin-adapter` provide/inject 给予便捷，不强制。
- 命名空间校验：`pluginId` 与各注册短 id **不得含 `:`**（归一用 `:` 连接）；校验失败 → 拒注册 + error 态。
- key 冲突 → 拒注册 + error 态并在管理面板展示。

---

## 十四、示例与测试

- `plugins/hello/` 扩展：新增 `StatsPanel.vue`（面板，读 `api.view/project.stats`）、一个顶栏按钮（`summarize` 私有命令触发）、一个设置栏目（读写 `aidea-plugin-config.hello`）——三管齐下演示注册面。
- **契约测试**（`src/__tests__/plugin/ui-registry.test.ts`）：
  - 注册 id 归一为 `pluginId:key`；重复 key 拒注册返回 `false` + error 态。
  - `unregisterByPlugin` 批量清除。
  - `ensurePanel` 幂等（二次注册不重复追加）。
- **合并层测试**：内置优先于插件、插件追加顺序确定性、`usePanelMeta` 返回正确。
- **布局归一化测试**：已发现未启用插件 id 保留、彻底移除清除、禁用→启用位置还原。
- **渲染**：`type-check` 零错误 + `test` 全绿 + 人工浏览器验证（`PluginErrorBoundary` 触发路径亦人工验证）。

---

## 十五、分阶段落地（对齐主文档 Phase 2）

| 阶段 | 内容 | 完成标志 |
| --- | --- | --- |
| **2a** | `src/stores/plugin.ts` 注册表 + `types/plugin.ts` UI 类型 + `adapter.ts` 组装 `ui` + Phase 1 的 manager 装载链路 + **registerPanel** + `uiMerge.ts` mergedPanel + 渲染点改造 + `ensurePanel` | 插件面板可注册、可拖拽、可持久化、错误隔离 |
| **2b** | **registerTopBarButton** + `wrapTopBarButton` 工厂 + mergedTopBar + `ensureTop` + onClick 隔离 | 顶栏按钮可注册、可换位 |
| **2c** | **registerSettingsCategory** + `useSettingsCategories`（分隔线分组） + 合并视图 + `PluginErrorBoundary` | 设置栏目可注册、分隔线隔离 |

每步遵循主文档 §二.8 的节奏：**只增不改 + hello 示例 + 契约测试**。

---

## 十六、与《插件系统设计.md》的一致性核对

- §五.2 `PluginAdapter`：补 `ui`（本轮新发布面）。
- §十一目录规划：`src/stores/plugin.ts`（已有规划）承接注册表；**新增** `src/plugin/uiMerge.ts`、`src/components/plugin/PluginErrorBoundary.vue`。
- §四.2 `collectPluginEntries()` 语义扩展：除"为 PluginManager 提供候选"，同时其产出的 discovered ids 兜底布局归一化合法集合（见 §八）。
- §九存储方案：`aidea-dock-* / aidea-top-*` 中新增插件 id，由 §八归一化维护。
- 勾住 §四.4 状态机：setup 抛错/半程注册回滚（§十一）与"单插件错误隔离"一致。

---

## 十七、实现落定记录（2026-08-30 已实现）

> 本节记录"设计 → 实现"的落地区别，供维护者对照。设计为未定稿、可演进，此处以实际代码为准。

### 17.1 已实现动作
- **SDK 面**：`PluginContext.adapter.ui` 已实现（类型与工厂在 `src/plugin/ui.ts`，经 `adapter.ts` re-export 给插件）。注册项类型遵循「从实现派生」现状，定义于 `ui.ts` 而非 `types/plugin.ts`（后者只留无依赖快照/契约）。
- **作用域**：`PluginManager.createPluginContext` 为每个插件组装 `api`（含 per-plugin `additions: createAdditionsApi(manifest.id)`）与 `ui: createPluginUiApi(manifest.id)`；共享 adapter 的 `ui` 为拒绝实现。
- **注册表**：`stores/plugin.ts` 三个 reactive Map（uiPanels/uiTopBarButtons/uiSettingsCategories）+ 注册/回滚方法；**注册成功即调 `layout.ensurePanel/ensureTop` 落位**（`defaultPlacement` 缺失兜底 'right' / `zone` 兜底 'left'）。
- **合并层**：`src/plugin/uiMerge.ts`（useMergedPanelIndex / useMergedTopBarIndex / useMergedPluginSettingsCategories / usePanelMeta）。**内置设置分类仍由 SettingsModal 自持**（避免反向耦合），merged 仅暴露插件设置栏目。
- **布局归一化**：`utils/dock.ts`/`utils/topbar.ts` 新增 `opts.isExtraValid`；layout store 用 `collectPluginEntries()` 派生的 discovered 插件 id 判定插件 key 合法性——禁用→启用不丢位置，彻底移除才清除。
- **渲染点**：DockPanel（PanelKey + merged meta + title 覆盖 + 插件面板包 ErrorBoundary）、ActivityBar（merged catalog + 「+」列表）、DockContainer（filter 未注册插件残留 + 真实索引 resize）、TopBarZone（merged topbar index）、SettingsModal（内置组 + 分隔线 + 插件组 + 新建内置 'plugins' 分类）。
- **插件管理栏目**：`src/components/settings/PluginsSection.vue`（取代并删除旧 `plugin/PluginManagerSection.vue`；冒烟测试重指向）。
- **additions 全链**：`stores/additions.ts` + `plugin/api/additions.ts`（scoped 前缀）+ `history.ts`（additionsChanges 应用/合并/batch）+ `projectFile.ts`（additions 序列化/解析，前缀过滤）+ `useProjectFile.ts` 调用点（打开 load / 保存 serialize / 新建 clear）。
- **测试**：`ui-registry.test.ts`、`stores/additions.test.ts`、`utils/dock.test.ts`/`topbar.test.ts` 的 isExtraValid 用例；全量 `type-check` 零错误 + `test` 408 全绿。

### 17.2 已确认的搁置项 / 偏差
- **provide('aidea-plugin-adapter') 未实现（后续增量）**：插件面板/设置组件暂时拿不到 per-plugin 的 scoped adapter；示例插件经 `createAdditionsApi('hello')` 变通（同作用域手动构造，与 manager 内部同款机制）。真实插件如需在 UI 组件内写 additions，待补 provide 后统一经 `ctx.adapter` 能力，避免直调内部工厂。
- **布局归一化的 discovered 插件 id 依赖编译期同步读取**：当前取 `collectPluginEntries()`。若未来迁运行时加载，`layout.store` 的 `isPluginKeyValid` 需改为异步注入来源。
- **UI 注册 id 冲突仅为"拒注册 + console.warn"**，不置插件 error（不影响其余注册项）。

---

## 十八、V2 重构落定（2026-08-30 已实现）：uiRegistry 登记总表 + delta 排布

> 上一版（§五 合并层 / §八.3 ensure 落位 / §十七 已实现）**已被取代**。经评审收敛为更简的
> 「登记总表 + delta 派生」三层链路，删除了 `uiMerge.ts`。设计为演进文档，以本节（V2）为当前实现。

## 十八.1 V2 目标架构（当前）

```
constants 品类表（纯数据）                     [constants/panels.ts, topbar.ts, settings.ts(新)]
      │  seed
      ▼
uiRegistry 登记总表（Origin/pluginId 归因）     [stores/uiRegistry.ts(新)]  ← 插件经 ctx.adapter.ui 注册进同一张表
      ▼ 读取
layout  delta 排布 + 派生实时目录               [stores/layout.ts 重写, utils/dock.ts, topbar.ts 重写]
      ▼ 渲染参考
渲染组件  ActivityBar / DockContainer / DockPanel / TopBarZone / SettingsModal
```

- **uiRegistry = 唯一登记表**：内置目录 init 时 seed（`origin:'builtin'`），插件注册进同一张表
  （`origin:'plugin'` + `pluginId` 归因，key = `${pluginId}:${id}`）。提供面板 / 顶栏按钮 / 设置栏目三张
  reactive Map 与 `registerPlugin*` / `removePlugin`。**不排布、不持久化**。
- **layout = 排布层**：只存用户排布 delta（顺序覆盖 / 跨侧移动 / 关闭 = `removed` / 尺寸），
  经 `deriveDockLayout` / `deriveTopLayout`（`utils/dock.ts` / `utils/topbar.ts`）实时派生
  `leftPanels` / `rightPanels` / `unplacedPanels` / `topLeft` / `topRight`，供渲染组件直读。
- **设置面板直读 uiRegistry**（`SettingsModal`），内置目录来自 `constants/settings.ts` seed 的登记表。
- **插件链**：`plugin/ui.ts` 三注册方法直写 uiRegistry（顶栏按钮先 `wrapTopBarButton` 再入表）；
  `stores/plugin.ts` 瘦身为仅启停 / 生命周期；`rollbackPluginUi` → `registry.removePlugin`。

## 十八.2 与 V1 的主要差异（全部为简化 / 移除）

| 主题 | V1（已被取代） | V2（当前） |
| --- | --- | --- |
| 合并层 | `uiMerge.ts`（内置目录 ∪ 插件注册表 派生） | **删除**——登记表唯一，渲染点直读派生目录 |
| 布局合法集 | `normalizeDockState` + `isExtraValid`（已发现插件前缀） | `parseDockDelta`（合法 = 登记表 ∪ 已发现插件前缀）；仅初始化清洗一次 |
| 插件首次落位 | `layout.ensurePanel / ensureTop`（注册即调） | **删除**——delta 派生自动按默认侧出现 |
| 补新增默认 | normalize 补齐 / `defaults` 兜底 | derive 自动追加（新增面板/按钮登记即现） |
| layout 类型 | `togglePanel/setActive(id: PanelId)` + 组件 `as` 强转 | 收宽 `PanelKey`，组件强转消失 |
| 设置内置目录 | SettingsModal 自持 | **constants/settings.ts** + uiRegistry seed |
| 持久化 key | 沿用旧 key，写完整列表 + normalize 清洗 | **沿用旧 key**（旧完整列表按 delta 读取语义等价，无迁移）；新增 `aidea-dock-removed` 存关闭面板 |
| 副作用 | removePanel 对插件面板重启后会被 ensure 重新加回 | **修复**：关闭语义持久化为 `removed`，重启不回弹 |

## 十八.3 仍保留 / 未触碰

- 插件 SDK 面 `ctx.adapter.ui` 三注册签名**零变化**（V1→V2 插件无感）。
- `wrapTopBarButton`（onClick 隔离 / menu 惰性 / disabled 惰性）、`PluginErrorBoundary` 渲染错误隔离不变。
- 冲突注册「拒注册 + warn 不覆盖」语义不变（迁至 uiRegistry 处理）。
- `provide('aidea-plugin-adapter')` 仍未实现（与 V1 相同的搁置项，见 §17.2）；delta 清洗对
  discovered 插件 id 仍依赖编译期 `collectPluginEntries()`（未来迁运行时加载需改注入来源）。
- Key 命名空间 `${pluginId}:${id}`、additions 全链（§17.1）不受影响。

---

## 十九、落定记录（2026-09-07 已实现）：右键菜单项注册 + 插件快捷键动作

- **第四类 UI 注册**：`ctx.adapter.ui.registerContextMenuItem({ id, scope: 'canvas'|'selection', label, icon?, danger?, when?, run })` → `{ ok, conflict? }`，登记进 uiRegistry 新表 `contextMenuItems`（key=`${pluginId}:${id}`，冲突拒注册）；`removePlugin` 回滚覆盖。渲染在 `useCanvasEvents.handleStageContextMenu` 构建处追加：无选中 = canvas 项、有选中 = selection 项（「发散」之后），`when({selectedNodeIds})` 过滤、`run` 收到展开拷贝；**不加分隔线**，`ContextMenu.vue` 渲染组件零改动。
- **插件快捷键动作**：`api.shortcuts.registerAction({ id, label, scope, defaultChord?, run })` → `{ ok, conflict? }`，登记进 uiRegistry 新表 `shortcutActions`。shortcuts 域 per-plugin 化：`createShortcutsApi(pluginId | null)`——共享实例传 `null`（`registerAction` 抛错拒绝），scoped 实例由 manager `createPluginContext` 注入 `manifest.id`（与 additions ownerId 同模式）。进自定义快捷键全链：shortcuts store `bindings`/`assign`/`validate`（插件命名空间覆盖不清理）、`useKeyboardShortcuts.runtimeMap` 合并、`ShortcutsSection` 列表合并可录制改键。详见 `docs/自定义快捷键.md`「插件注册的动作」。
- **冲突返回值规范化（部分）**：新两类注册定义可探测返回值 `{ ok, conflict: 'id' | 'chord' }`（uiRegistry 现有三类 `registerPlugin*` 仍返回 boolean）；面板/顶栏/设置栏目 api 层注册仍为「拒注册 + warn」。
- **测试**：新增 `__tests__/plugin/api-shortcuts.test.ts`（15 用例）、`__tests__/composables/useCanvasEvents.pluginMenu.test.ts`（6 用例），ui-registry / shortcuts store / useKeyboardShortcuts 扩展共 24 用例；hello 插件演示两组注册。