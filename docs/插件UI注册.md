# 插件 UI 注册与渲染（架构讲解）

> 本文是 `docs/插件系统.md` 的下游细化，讲清主程序如何加载插件注册的自定义 UI 组件并渲染。
> 覆盖七类注册：**面板（panel）**、**顶栏按钮（topBarButton）**、**设置栏目（settingsCategory）**、
> **右键菜单项（contextMenuItem）**、**快捷键动作（shortcutAction）**、**模态面板（modal）**、**浮动层（floatingLayer）**。
> 渲染配套见 `docs/可拖拽面板与左右侧边栏.md`、`docs/顶部栏按钮注册与拖拽.md`、`docs/插件模态面板.md`、`docs/插件开发手册.md`；
> 桌面运行时见 `docs/Electron桌面架构.md`。

---

## 一、核心架构

插件**不把组件硬塞进界面**，而是把「运行时组件对象」登记进 **`uiRegistry` 登记总表**（内置目录 seed + 插件注册进同一张表，条目带 `origin`/`pluginId` 归因），再由 **`layout` store** 用 **delta 排布模型**纯派生出渲染目录，组件随派生自动出现 / 移除。渲染组件只读派生目录，不做任何合并或合法性判断。

数据流：

```
constants 品类表（纯数据：PANEL_CATALOG / TOP_BAR_CATALOG / SETTINGS_CATALOG）
      │ seed（store 创建时）
      ▼
uiRegistry 登记总表（7 张 reactive Map，origin/pluginId 归因，只登记不排布、不持久化）
      │ 插件经 ctx.register 注册进同一张表（key = `${pluginId}:${id}`）
      ▼ 读取
layout  delta 排布 + 实时派生（deriveDockLayout / deriveTopLayout，values 纯函数）
      │  派生结果 leftPanels / rightPanels / unplacedPanels / topLeft / topRight
      ▼ 渲染参考
渲染组件  ActivityBar / DockContainer / DockPanel / TopBarZone / SettingsModal
```

三层各自职责单一：

- **`uiRegistry` = 唯一登记表**：内置目录 `init` 时 seed（`origin:'builtin'`），插件注册进同一张表（`origin:'plugin'` + `pluginId` 归因，key = `${pluginId}:${id}`）。只回答「有哪些 UI、默认放哪侧」，**不排布、不持久化**。
- **`layout` = 排布层**：只存用户排布 delta（顺序覆盖 / 跨侧移动 / 关闭 = `removed` / 尺寸），经 `deriveDockLayout` / `deriveTopLayout` 实时派生渲染目录，供渲染组件直读。
- **`settings` 直接读 `uiRegistry`**：`SettingsModal` 左侧导航 = 登记表内置 + 分隔线 + 插件栏目，不做独立存储。

> 插件链：`plugin/ui.ts` 的六个 `register*` 直写 `uiRegistry`（顶栏按钮先 `wrapTopBarButton` 包装为逻辑组件再入表）；`stores/plugin.ts` 只管启停 / 生命周期，不再持有 UI 注册；setup 半程抛错经 `rollbackPluginUi` → `registry.removePlugin` 批量清理。

---

## 二、相关文件

| 文件 | 职责 |
| --- | --- |
| `constants/panels.ts` | 内置面板品类表 `PANEL_CATALOG`（id/icon/titleKey/component/defaultPlacement）+ `PanelKey`/`PluginPanelKey` 类型 |
| `constants/topbar.ts` | 内置顶栏按钮品类表 `TOP_BAR_CATALOG`（id/titleKey/defaultZone/component）+ `TopBarKey`/`PluginTopBarKey`/`TopBarZone` |
| `constants/settings.ts` | 内置设置分类品类表 `SETTINGS_CATALOG`（内置 Section 组件），seed 进登记表 |
| `constants/shortcuts.ts` | 内置自定义快捷键动作 `CUSTOM_SHORTCUTS`（插件动作不走登记表以外的层） |
| `stores/uiRegistry.ts` | **登记总表**：7 张 reactive Map + `registerPlugin*` / `removePlugin` / seed / reset |
| `stores/layout.ts` | **排布层**：delta 持久化 + 实时派生 `leftPanels/rightPanels/unplacedPanels/topLeft/topRight` + 激活/拖拽/跨侧动作 + `resetDock` |
| `plugin/ui.ts` | 插件注册面 `createPluginRegister`、模态/浮动层运行时 `createPluginModalApi`/`createPluginFloatingApi`、`wrapTopBarButton`、`rollbackPluginUi` |
| `plugin/adapter.ts` | `PluginContext` 组装（`register` / `modal` / `floating` / `adapter.for(id)` 命名空间） |
| `plugin/manager.ts` | 插件装载 + 生命周期（`installAll` / `activate`，setup 抛错回滚 UI 注册） |
| `stores/plugin.ts` | 插件 run 时状态：启停持久化 + `init()` 装载（先回填发现集、后 `installAll`） |
| `utils/dock.ts` | dock delta 纯函数：`parseDockDelta` / `deriveDockLayout` / `reorderSeq` / `dropSize` / `PANEL_DRAG_MIME` 拖拽协议 |
| `utils/topbar.ts` | 顶栏 delta 纯函数：`parseTopDelta` / `deriveTopLayout` / `TOP_DRAG_MIME` 拖拽协议 |
| `components/common/DockPanel.vue` | 唯一面板外壳：读登记表面板条目，标题/图标/关闭/拖拽手柄，插件面板包 `PluginErrorBoundary` |
| `components/layout/ActivityBar.vue` | 左侧活动栏：按 `layout.leftPanels` 渲染图标 + 收起/展开 + 底部「+」未放置列表 |
| `components/common/DockContainer.vue` | 右侧 dock 容器：按 `layout.rightPanels` 垂直堆叠 + resize + 同侧换位 |
| `components/layout/LeftSidebar.ts`/`RightSidebar.ts` | 左/右面板区外壳，只放 `<DockPanel :panel-id>` |
| `components/common/TopBarZone.vue` | 顶部栏通用容器：按 `layout.topLeft`/`topRight` 渲染 + 拖拽排序 + 跨区放置 |
| `components/common/TopBarButton.vue` | 顶栏按钮通用外壳（icon/tooltip/active/primary/disabled/split-menu） |
| `components/plugin/PluginErrorBoundary.vue` | 插件 UI 渲染错误边界（onErrorCaptured 拦截 → 占位 + 重试） |
| `components/layout/PluginModalHost.vue` | 模态面板宿主：读 `registry.modals` 渲染 |
| `components/layout/PluginFloatingHost.vue` | 浮动层宿主：读 `registry.floatingLayers` 逐条渲染 `FloatingWindow` 壳 |
| `components/settings/SettingsModal.vue` | 设置弹窗：登记表内置 + 分隔线 + 插件栏目，插件 Section 包边界 |
| `components/settings/*Section.vue` | 各内置设置分类 Section（纯内容），`constants/settings.ts` 登记 |

---

## 三、关键类型和函数

### 3.1 `uiRegistry` 登记总表（`stores/uiRegistry.ts`）

7 张 reactive Map（插入顺序 = 默认展示顺序）：

| 表 | 条目类型 | 内置来源 | 插件来源 |
| --- | --- | --- | --- |
| `panels` | `UiPanelEntry`（key/origin/pluginId?/titleKey?/title?/icon/component/defaultPlacement） | seed `PANEL_CATALOG` | `registerPluginPanel` |
| `topBarButtons` | `UiTopBarEntry`（…/component/defaultZone） | seed `TOP_BAR_CATALOG` | `registerPluginTopBarButton` |
| `settingsCategories` | `UiSettingsEntry`（…/descKey?/icon?/component） | seed `SETTINGS_CATALOG` | `registerPluginSettingsCategory` |
| `shortcutActions` | `UiShortcutActionEntry`（def: PluginShortcutActionRegistration） | 无（内置在 `CUSTOM_SHORTCUTS`） | `registerPluginShortcutAction` |
| `contextMenuItems` | `UiContextMenuItemEntry`（def: PluginContextMenuItemRegistration） | 无（内置在 `useCanvasEvents` 构建处） | `registerPluginContextMenuItem` |
| `modals` | `UiModalEntry`（def: ModalRegistration） | 无 | `registerPluginModal` |
| `floatingLayers` | `UiFloatingLayerEntry`（title?/component） | 无 | `registerPluginFloatingLayer` |

归因：条目 `origin: 'builtin' | 'plugin'`；插件条目必有 `pluginId` 且 `key = pluginKey(pluginId, id) = \`${pluginId}:${id}\``；内置条目 `key = 品类 id`（不含 `:`，与插件 key 天然不冲突）。

注册方法签名：

```ts
registerPluginPanel(pluginId, reg): boolean
registerPluginTopBarButton(pluginId, reg): boolean                      // reg 为已包装后的组件
registerPluginSettingsCategory(pluginId, reg): UiRegisterResult         // { ok } | { ok:false, conflict:'id' }
registerPluginShortcutAction(pluginId, def): UiRegisterResult
registerPluginContextMenuItem(pluginId, def): UiRegisterResult
registerPluginModal(pluginId, def): UiRegisterResult
registerPluginFloatingLayer(pluginId, reg): boolean
removePlugin(pluginId): void               // 按 pluginId 批量删全部 7 表
reset(): void                              // 清空并重 seed 内置（测试用）
```

合法性校验 `isValidId`：非空 + 不含 `:` + 不含空白（pluginId 与短 id 同规则）。

### 3.2 插件注册面 `ctx.register`（`plugin/ui.ts` `PluginRegisterApi`）

插件 `setup(ctx)` 里经 `ctx.register` 现场注册运行时组件对象，转发写入 `uiRegistry`：

```ts
registerPanel(entry: PluginPanelRegistration): void
registerTopBarButton(entry: PluginTopBarButtonRegistration): void
registerSettingsCategory(entry: PluginSettingsCategoryRegistration): void
registerContextMenuItem(entry): { ok; conflict?: 'id' }
registerShortcutAction(entry): { ok; conflict?: 'id' | 'chord' | 'reserved' | 'binding' }
registerModal(def: ModalRegistration): { ok; conflict?: 'id' }
registerFloatingLayer(entry): void
```

各注册项类型（`plugin/ui.ts`）：

- `PluginPanelRegistration`：`{ id, title, icon, component, defaultPlacement?('left'|'right' 缺省 'right') }`
- `PluginTopBarButtonRegistration`：`{ id, title, icon, onClick, zone?('left'|'right' 缺省 'left'), variant?, disabled?(()=>boolean), menu? }`
- `PluginSettingsCategoryRegistration`：`{ id, title, component }`
- `PluginContextMenuItemRegistration`：`{ id, scope('canvas'|'selection'), label, icon?, danger?, when?({selectedNodeIds}) , run({selectedNodeIds}) , children? }`
- `PluginShortcutActionRegistration`：`{ id, label, scope, defaultChord?, run() }`
- `ModalRegistration`：`{ id, title, component, width? }`
- `PluginFloatingLayerRegistration`：`{ id, title?, component }`

模态/浮动层运行时面（`ctx.modal` / `ctx.floating`，与 `adapter.for(id).modal/floating` 同工厂）：
`PluginModalApi`：`open(id): boolean` / `close()`；`PluginFloatingApi`：`open(id)` / `close(id)` / `toggle(id)` / `isVisible(id)` —— open/toggle 先查登记表（未登记 warn + false），close/isVisible 幂等只读。

### 3.3 layout 排布层（`stores/layout.ts`）

- delta 纯函数（`utils/dock.ts` / `utils/topbar.ts`）：
  - `parseDockDelta(raw, isKnown): DockDelta` —— 读取 localStorage 后清洗一次：过滤非字符串 / `isKnown` 为假 / 重复项，`rightSizes` 仅保留正数。
  - `deriveDockLayout(defs: PlacementDef[], delta): DockPlacement` —— 归属按 `rightOrder`/`leftOrder` 命中优先（同现右优先），否则 `defaultPlacement`；`removed` 中的面板排除；顺序 = 用户顺序优先、其余按登记追加。`PlacementDef = { key, defaultPlacement }`。
  - `deriveTopLayout(defs: ZoneDef[], delta): TopPlacement` —— 同构，`ZoneDef = { key, defaultZone }`。
- layout store 派生结果：`leftPanels` / `rightPanels` / `unplacedPanels` / `topLeft` / `topRight`（均为「登记条目」数组中，仅含已登记的键，渲染层零过滤）。
- 持久化 delta（localStorage 只存用户显式改动）：`aidea-dock-left` / `aidea-dock-right` / `aidea-dock-removed` / `aidea-dock-sizes` / `aidea-top-left` / `aidea-top-right`。清空 = 恢复默认（`resetDock` 内含 `resetTopBar`）。
- 插件 key 合法性：`isKnown = 已登记 ∪ ${前缀 ∈ discoveredPluginIds}`；`setDiscoveredPluginIds(ids)` 在插件 `installAll` 之前回填并重清洗 delta。

---

## 四、调用链与 delta 派生

### 4.1 注册 → 界面出现（以 panel 为例）

1. 应用启动，`pluginStore.init()`（`main.ts` 调用）：`collectPluginEntries()` 同步得到待装载条目（含禁用）→ **先** `layout.setDiscoveredPluginIds(ids)` 回填发现集并重清洗 delta → **再** construct `PluginManager` → `installAll()`。
2. `installAll()` 遍历启用插件调 `loader()` 取模块 → `activate(id)` 校验 SDK 版本、建 context、调 `plugin.setup(context)`（单插件失败仅置 error，不影响其它）。
3. `setup` 内 `ctx.register.registerPanel(entry)` → `createPluginRegister` 校验短 id → `registry.registerPluginPanel(pluginId, entry)` 写入 `registry.panels`（key = `${pluginId}:${id}`，改 `defaultPlacement` 缺省 'right'）。
4. layout 的 `placement` computed 依赖 `registry.panels` 与 delta —— `registry.panels` 变化的瞬间，`deriveDockLayout` 重跑，`leftPanels` / `rightPanels` 自动多出新条目。
5. `ActivityBar` 遍历 `layout.leftPanels` 渲染图标；点击图标 `layout.togglePanel(key)` 展开；左侧 `LeftSidebar` / 右侧 `RightSidebar` 内 `DockPanel` 经 `useUiRegistryStore().panels.get(panelId)` 拿元信息渲染标题/图标/组件。

顶栏按钮是同一链路：`ctx.register.registerTopBarButton` → 先 `wrapTopBarButton(entry)` 包成等价逻辑组件 → `registerPluginTopBarButton` → `topLeft`/`topRight` computed 自动更新 → `TopBarZone` 渲染。

### 4.2 delta 持久化让「新增自动出现、删除自动收敛」

localStorage 只存**用户显式改动**（顺序覆盖 / 跨侧移动 / 关闭 = `removed` / 尺寸），每次写 delta 立即 `persistDock()` / `persistTop()`。渲染目录是实时派生，因此：

- **新增登记自动出现**：新内置品类或新插件注册进 `uiRegistry` 后，其键不在任何 delta 里，`deriveDockLayout` 按 `defaultPlacement` 追加到默认侧末尾——无需任何落位动作。
- **删除自动收敛**：插件禁用（重启生效）后不再 setup、不再注册，其键从登记表消失；delta 清洗又允许该键短暂滞留（见 §8），派生层 filter 掉未登记键，界面即消失。彻底移除后 `setDiscoveredPluginIds` 重清洗把残留键从 delta 剔除。
- **恢复默认** = 清空全部 delta（`resetDock` 移除 localStorage 并置空内存 delta），登记表默认顺序即时生效。

---

## 五、实现细节与踩坑点

### 5.1 冲突拒注册，不抛错

`uiRegistry` 的 `registerPlugin*`：短 id 非法 / key 已存在 → `console.warn` 并拒绝（不覆盖、不污染其它注册项）。内置 id 不含 `:`，与插件 key `${pluginId}:${id}` 天然不冲突。`createPluginRegister` 层再做一次前置校验并 warn，把失败收敛为「跳过该注册项」，其余注册项继续生效。`registerSettingsCategory` 另有一硬约束：**一个插件至多一个设置栏目**（同 pluginId 已有任意设置栏目即拒，`{ ok:false, conflict:'id' }`），保证设置弹窗导航中插件条目与插件一一对应。

### 5.2 `wrapTopBarButton`：描述符 → 等价逻辑组件

插件顶栏按钮是描述符（icon/title/onClick/variant/disabled/menu），而渲染统一走内置「逻辑组件 + `TopBarButton` 外壳」。为此 `wrapTopBarButton` 用 `defineComponent` 包一层：

- `onClick` 统一 `try/catch`（点击抛错仅 `console.error`，不卸载插件、不置 error 态）；
- `disabled` 为惰性取值函数，渲染期实时求值（与内置按钮语义对齐）；
- component name 用 `legalizeComponentName` 把 key 里非法字符替换为 `_`。
渲染侧 `TopBarZone` 只认逻辑组件，零改动。

### 5.3 `PluginErrorBoundary` 渲染错误隔离

插件 UI 的渲染错误不得传染主应用。`PluginErrorBoundary.vue` 基于 `onErrorCaptured`：捕获 → 记 console + 展示占位（插件名 + 错误摘要 + 「重试」按钮，`reset` 复位并重挂子树），`return false` 阻断向上冒泡。使用位置：`DockPanel` 内仅插件源面板（`meta?.pluginId` 才包）、`SettingsModal` 插件 Section、`PluginFloatingHost`、`PluginModalHost`。顶栏按钮 onClick 已在 `wrapTopBarButton` try/catch，无需边界组件。

### 5.4 `defaultPlacement` / `zone` 兜底

`defaultPlacement` 缺省 `'right'`（面板默认进右侧 dock），`zone` 缺省 `'left'`（按钮默认进左顶部条）——都是 `?? 兜底` 语义，插件可不写。

### 5.5 discovered 插件 id 的合法性判定

delta 清洗的合法集合 = 内置 ∪ **已发现**插件前缀（而非「已注册」）。`collectPluginEntries()` 启动时即得全部插件（含未启用），故 × 发现集 + × 时序优于「已注册」：

- **禁用 → 启用不丢位置**：插件禁用后不注册，但其键的 pluginId 前缀 ∈ 发现集 → delta 判定合法被保留；重新启用后注册恢复，位置原样。
- **彻底移除才清除**：源码删除后前缀 ∈ 发现集，`setDiscoveredPluginIds` 重清洗把残留键剔除。
- **窗口期**：由于发现集回填是异步的（setup 时集合可能尚空），初始 parse 用 `isKnownInitial`（插件前缀键含 `:` 一律先保留——宁可多保留，派生层与渲染层会 filter 掉未登记键），回填后再用完整 `isKnown` 重清洗修正。

### 5.6 `removed` 关闭语义防重启回弹

面板「关闭（×）」进入 `removedPanels`（`removePanel`，同时清两侧顺序记录与尺寸），由 `removed` delta 持久化。关闭语义是**用户显式改动**，重启后与插件 registrations 无关——被关面板不会因重新注册而回弹到界面；活动栏「+」从 `unplacedPanels`（removed 里仍登记的条目）恢复。同理 `moveToLeft`/`moveToRight` 会清掉该面板的 removed 与对侧记录，保证跨侧后的唯一归属。

### 5.7 生命周期一致性

- `stores/plugin.ts` 只管启停与重载：`setEnabled` 仅持久化启用意愿 + 更新记录，**重新加载生效**；`reload` 经 `manager.disposeAll()` 回滚注册后重扫重装，运行期不做逐条卸载注册。
- setup 半程抛错：`manager.activate` catch → `context.dispose()` → `rollbackPluginUi(record.id)` = `registry.removePlugin`（按 pluginId 批量删 7 表），布局派生自动收缩——不残留半激活插件 UI，error 态只在管理面板可见。