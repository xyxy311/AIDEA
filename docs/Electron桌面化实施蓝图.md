# Electron 桌面化实施蓝图

> 决策结论：最终发布形态采用 **Electron 桌面壳 + 运行时插件加载**。
> 选型分析（Electron vs Tauri vs 本地 companion 服务 vs 纯 Web 各方案）见本次会话决策记录；本文只写实施依据。
> 核心约束来自 `docs/插件系统设计.md` 横切原则 A：**加载收集是唯一可变点**，本文是它的兑现方案。
>
> **版本定位：桌面端为唯一正式版本**。
>
> > **2024 纯桌面收敛决定**：本项目已收敛为**纯 Electron 桌面应用**，web 部署形态全部移除——
> > `dev:web` / `vite preview` / `scripts/build-web.mjs` / `plugins/index.json` web 静态清单 /
> > `src/plugin/sources/web.ts`（web 插件源）与无桥降级分支（`isDesktopRuntime` 互斥）/
> > 浏览器 File System Access 文件 IO（改走 main 进程 dialog + fs，经 `window.aideaFile` 桥）。
> > 代码恒假设桌面桥存在；本文下文仍残留「web 双形态」表述的章节按本收敛决定作废处理。

## 1. 目标与最终形态

- **桌面版**：Electron 壳（main 进程负责扫描/watch/协议/编译，preload 暴露窄桥）+ renderer 原封不动。用户往插件目录放入**单文件 ESM bundle** → 启动静默扫描 → `aidea-plugin://` 协议动态 `import()` → 插件经 `ctx.register` 注册面板/顶栏按钮/设置栏目/右键菜单/快捷键/模态/浮动层 → uiRegistry 派生渲染自动生效。
- **插件目录**：dev 与生产同构——dev 为 `<仓库根>/plugins/`（插件源码与 plugin.js 装载产物同根，宿主构建零接触，见 §6），生产为 `userData/plugins/`。装载统一为**应用启动时扫描**（见 §4）：经 Electron 桥扫描 + 按 `location.protocol` 分支装载（dev 经 dev-server URL transform、生产经 `aidea-plugin://` 协议）；web 静态清单已删除。
- **版本定位**：桌面端 = **唯一正式版本**；已收敛为纯 Electron 应用，web 辅助形态移除。
- **目录变更**：watch 检测 + 提示"重启后生效"，**不做真热重载**（见 §8）。
- **可选增强（M3）**：目录直接放 `index.ts`，main 进程 esbuild 免构建编译后透明装载，对 renderer 与分发契约不可见。

## 2. 侵入面总览（一句话）

对既有架构的全部改动 = **一个函数签名 async 化（`collectPluginEntries`）+ 一个字段 ref 化（`layout.ts:40`）+ 一处 await（`plugin.ts init`）+ `vite.config.ts` 的 mode 分流（dev alias/exclude、build external）**；其余为新增文件（electron/ 壳、`src/plugin/sources/`、scripts/、import map）。web 分发脚本（build-web.mjs 等）已随纯桌面收敛删除。

### 改动清单（精确到函数）

| 文件 | 改动 |
|---|---|
| `src/plugin/manager.ts` | `collectPluginEntries()` 签名 `PluginEntry[]` → `Promise<PluginEntry[]>`，函数体收敛为调 `sources/index.ts` 聚合（编译期 glob 源已废除）；`pluginIdFromPath` 迁入本文件定义（保留导出，测试引用不动）；**PluginManager 主体零改动** |
| `src/stores/plugin.ts` | `init()`：`entries: await collectPluginEntries()`；装载完成前回调 layout 回填（§5）；`PluginRecord` 增 `source: 'builtin' \| 'local'` 字段（插件管理面板展示来源） |
| `src/stores/layout.ts:40-48` | `discoveredPluginIds` 改 ref；delta 初始 parse 改为"插件前缀键一律保留"；新增 `setDiscoveredPluginIds()` 回填后重清洗（§5） |
| `vite.config.ts` | mode 分流（§6/§9）：dev = SDK_VENDOR alias → `/vendor/*.js` + `optimizeDeps.exclude`；build = `rollupOptions.external`（bare import 留给 import map）——宿主与插件共享同一 SDK 实例 |
| `index.html` | 注入 import map（§6）+ CSP `script-src` 放行 `aidea-plugin:` |
| `package.json` | scripts 最终形态（§9）+ devDeps（electron、esbuild、chokidar；electron-builder 属 M4） |
| `tsconfig.json` | include 增加 `electron/shared/bridge.ts`（renderer type-only import 契约文件） |
| 测试 | source.test 改 await；新增：sources 聚合与互斥裁决（桌面桥扫描 / web 清单）、协议 traversal 用例、layout 回填清洗保留禁用插件 delta、清单获取失败空集 |

### 明确不碰（红线资产）

`adapter.ts` / `plugin/ui.ts` / `uiRegistry` / `dock.ts` / `topbar.ts` / layout 派生目录与全部 action（§5 指名三行除外）；`PluginManager` 主体（`installAll`/`loadRecord`/错误隔离——`loadRecord` 的 `manifest.id !== entry.id` 校验正好兜住目录名与内联 id 不符）；`plugins/ai/` 全部源码与品类表（唯一例外：构建脚本产出的 `plugin.js` 产物，见 §9）；DataPatch/history/useCommands 全链路；`main.ts`（`void init()` 已异步）。

## 3. 进程边界与 IPC 契约

### main 职责（全部文件系统访问收敛于此）

```
扫描   electron/main/plugins.ts: scanPluginsRoot(): DesktopPluginInfo[]
       # 读插件根；每个子目录：目录名=pluginId（强校验 ^[a-z0-9_-]+$），
       # 读可选 manifest.json（JSON.parse 失败 → 条目带 error），按 plugin.js > index.js > index.mjs
       # 判定入口；无 entry → 跳过。零代码执行。
协议   electron/main/protocol.ts: aidea-plugin:// handler（§7）
编译   (M3) electron/main/compile.ts: esbuild 编译 index.ts → 缓存产物，对 renderer 透明
```

### preload 窄接口

契约全量集中在 `electron/shared/bridge.ts`（main 与 renderer 双向 import；main 进程也用它，故除类型与常量外不得含运行时副作用）：

```ts
export const IPC = { LIST: 'plugins:list', CHANGED: 'plugins:changed' } as const

export interface DesktopPluginInfo {
  id: string                            // 目录名，^[a-z0-9_-]+$，同时是协议 URL 的 host
  entry: string                         // 入口文件名（相对插件目录）
  manifest: PluginManifestJSON | null   // 外置清单；null = 装载时读插件内联
  error?: string                        // 结构非法等原因（UI 可展示，装载层跳过）
}

export interface DesktopBridge {
  readonly kind: 'desktop'
  listPlugins(): Promise<DesktopPluginInfo[]>                // 无参数——目录由 main 决定，renderer 永远不给路径
  onPluginsChanged(cb: (ids: string[]) => void): () => void  // 返回取消订阅
}
```

**绝不暴露**：fs/path/shell/dialog、任何携带任意路径参数的通道、`ipcRenderer` 本体。M1 范围 main 侧不发送 `CHANGED`（watch 属 M2），但 preload 完整实现订阅转发，契约一次到位。

### renderer 特性检测注入点（唯一）

- `src/plugin/sources/desktop.ts` 顶部 `const bridge = window.aideaDesktop ?? null`——全 renderer 唯一桥访问点，`window.aideaDesktop` 的全局类型声明也在 `bridge.ts` 内（`declare global`）。
- 桥为 null（web）→ 走 web 静态清单源；桥在但 IPC 失败 → try/catch 空集 + console.error，互斥两源不互相回退。

## 4. 唯一可变点的结构化落地（sources/）

仓库曾刻意删掉过度抽象的接口壳（manager.ts 头注释），因此**不再引入 PluginSource 接口**——两个具名源函数 + 一个聚合函数，`PluginEntry` 形状（`{ id, loader }`）不变：

```ts
// src/plugin/sources/web.ts —— web 静态清单源（web 形态的「启动时扫描」等价物）
export async function collectWebEntries(): Promise<PluginEntry[]>
// fetch('/plugins/index.json') → loader = () => import(/* @vite-ignore */ `/plugins/${id}/${entry}`)

// src/plugin/sources/desktop.ts —— 全 renderer 唯一桥访问点
export async function collectDesktopEntries(): Promise<PluginEntry[]>
// loader 按 location.protocol 分支（http/https = dev server 伺服）：dev → dev-server URL
// /plugins/<id>/<entry>（vite transform 装载，与宿主共享预打包 SDK）；生产（app://）→
// aidea-plugin:// 协议（bare 由 import map 解析）。⚠ 判据勿用 import.meta.env.DEV：
// vite 6 dev 下它是模块顶部注入的运行时对象（非编译期替换），真机 Electron dev
// renderer 里求值不可靠（实测落到 false → 协议分支 → vendor 双 SDK 实例 → useStore 崩）

// src/plugin/sources/index.ts —— 聚合与互斥裁决：有桥 → 仅桌面源；无桥 → 仅 web 源；未来多源冲突时内置优先
export async function collectPluginEntries(): Promise<PluginEntry[]>
```

防泄漏规则：`if (electron)` 类分支**只允许存在于 `sources/` 内**；manager.ts 只调聚合函数，对源数量无感知——未来加"远程插件源" = 聚合里加第三项，其他零改动。

**编译期 glob 源废除的动机**：① **装载唯一路径**——宿主构建不碰 `plugins/` 内容，一切插件（含官方 AI 插件）在应用启动时经扫描/清单装载；② **SDK 单实例**——glob/预打包路径会产生第二份 vue/pinia 模块实例（插件组件上下文断裂），统一经 import map 解析 vendor 产物后，宿主与插件、vendor 四包之间共享同一实例。

## 5. layout 异步化（保持"禁用→启用不丢布局"）

**问题**：`layout.ts:77-98` 的 delta 清洗只在 store setup 时跑一次，之后 persist 写回清洗结果。若初始 parse 时发现集为空（IPC 未回），禁用插件键被滤掉 → 用户任一 persist 操作把丢失写死。

**方案：初始 parse 不过滤插件前缀 + 回填后补一次重清洗**（零新持久化键；宁可多保留——多保留无害，派生层 `filter(e => !!e)` 与渲染层天然忽略未登记键）：

```ts
const discoveredPluginIds = ref(new Set<string>())   // 原 line 40：同步 Set → ref
const pluginPrefixKnown = (key) => discoveredPluginIds.value.has(key.slice(0, key.indexOf(':')))

// delta 初始化（原 line 77-98）：谓词改为「不依赖插件前缀」——插件前缀键初始一律保留
const isKnownInitial = (key) => registry.panels.has(key) || registry.topBarButtons.has(key) || key.includes(':')

// 新增 action：plugin store 回填时调用（回填在 installAll 之前：注册 UI 前 delta 已正确）
function setDiscoveredPluginIds(ids: string[]): void {
  discoveredPluginIds.value = new Set(ids)
  // 用「内置键 ∪ 插件前缀 ∈ 发现集」重清洗五组 delta（dock 左右/removed/sizes + top 左右）+ persist 一次
}
```

时序论证：setup（不滤）→ mount 后 init await（毫秒-百毫秒级）→ 回填重清洗。窗口期用户不可能完成拖拽；期间任何 persist 都是"多保留"，回填后修正。init 失败（IPC 断）→ 集合为空 → 插件键全保留 → 不丢布局，僵尸键留待下次成功装载清洗。web 版统一走同一条"回填重清洗"路径，两形态行为一致、测试一套。

## 6. 插件分发契约 v1 与共享依赖

### 目录插件规格（M1）

```
<仓库根>/plugins/             # dev；prod 为 userData/plugins/（两形态目录同构）
  ai/                         # 官方 AI 插件：index.ts 源码（类型检查面）+ plugin.js 产物（两形态装载入口，构建脚本产出、gitignored）
  index.json                  # web 形态清单 [{id, entry}]（package-plugin.mjs 维护、build-web.mjs 分发到 dist）
  <plugin-id>/                # 目录名 = pluginId，强制 ^[a-z0-9_-]+$（协议 host 小写化约束）
    plugin.js                 # 必须：单文件 ESM bundle，default export AideaPlugin（manifest 可内联）
    manifest.json             # 可选：与 PluginManifest 同构；供扫描期零代码执行列清单
    assets/ ...               # 任意辅助文件，经协议按需加载，扫描器不管
```

- 入口判定优先级 `plugin.js > index.js > index.mjs`（main 扫描决定，renderer 拿到的 `entry` 已是结果）。
- **清单与扫描**：目录插件入口一律 `.js/.mjs`（桌面运行时扫描收集）；web 形态以 `plugins/index.json` 为扫描等价物（打包脚本全量重写，插件删除自动收敛）。`plugins/ai/` 在产物缺失时被扫描器天然跳过（无 entry）。
- `manifest.json` 缺省合法：扫描返回占位条目，真实 manifest 由装载时 `loadRecord` 读内联并校验（id 匹配校验兜住目录名与内联 id 不符）。

### 插件侧禁令（写入插件开发手册）

禁 import `electron` / Node 内置模块（协议加载的浏览器环境解析不到，天然失败）；禁 Vite/构建 API；禁探测 `window.aideaDesktop` 分叉行为（插件代码不感知宿主形态）。M1-M2 插件 UI 组件 = 渲染函数 `h()`；SFC 需作者自行 vite build 成 bundle。

### 共享依赖与 import map（正确性必需，M1 落地）

插件组件渲染在宿主 Vue 应用上下文（adapter/pinia inject），插件 bundle **必须与宿主共享同一 `vue` 模块实例**——两个 Vue 副本 = 组件上下文断裂。因此插件打包时宿主依赖声明为 external，bare import 由宿主 import map 解析：

```html
<script type="importmap">
{ "imports": {
    "vue": "/vendor/vue.js",
    "pinia": "/vendor/pinia.js",
    "naive-ui": "/vendor/naive-ui.js",
    "konva": "/vendor/konva.js" } }
</script>
```

**vendor 产物方案（实现细化）**：不逐包复制 ESM build（naive-ui 依赖树 vueuc/vooks 等太深），改用 esbuild 把每个包 bundle 成单文件 ESM（入口 `export * from 'pkg'` + namespace default），**四包互相 external（自身除外）**——naive-ui/pinia 内部的 import 'vue' 保留 bare，由 import map 网状解析，杜绝 vendor 内嵌第二份 vue；并注入 vue esm-bundler feature flags（`__VUE_OPTIONS_API__` 等，vendor 产物不经 vite 编译，缺 flag 直接 ReferenceError）。产物落 `public/vendor/*.js`（gitignored；**仅生产链路需要**：`build` / `build:desktop` 产到 dist/vendor，dev 下 import map 闲置）。SDK 单实例归一：**dev 走 vite 原生模块图**——插件经 dev-server URL（`/plugins/<id>/plugin.js`）transform 装载，bare import 重写为预打包产物，与宿主同一实例（`sources/desktop.ts` 的 loader 按 `location.protocol` 分支——http(s)=dev server 伺服；⚠判据勿用 `import.meta.env.DEV`：vite 6 dev 下是运行时注入对象，真机 Electron dev renderer 实测落到 false）；**生产**宿主 build external + 插件协议原生加载，bare import 统一经 import map → dist/vendor。external 清单收敛为常量 `SDK_VENDOR = ['vue', 'pinia', 'naive-ui', 'konva']`（`electron/shared/vendor.ts`）——M1 AI 插件打包、M3 编译、插件作者打包模板共用，**一处定义多处使用（当前四处，含 vendor 产物构建），只增不减**。

## 7. 自定义协议设计

| 项 | 决策 |
|---|---|
| 协议名 | `aidea-plugin`；`protocol.registerSchemesAsPrivileged` 在 app ready **前**注册：`{ standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }`（standard 是相对路径正确解析的前提，corsEnabled 是跨 origin module import 的前提） |
| URL 规则 | `aidea-plugin://<pluginId>/<相对路径>`；映射 `<插件根>/<pluginId>/<相对路径>`；URL 永不含物理路径 |
| handler | `protocol.handle`；白名单：仅当 pluginId ∈ 本次扫描结果（内存 `Map<id, absDir>`）才解析，杜绝任意目录读 |
| traversal 防护 | `path.normalize` 后 `resolve` 结果必须以插件目录 `resolve` 前缀开头（含分隔符），否则 403；拒空路径。**M1 必须带单测**（`../`、URL 编码 `%2e%2e`、绝对路径注入、双斜杠） |
| MIME | `.js/.mjs → text/javascript`（缺 MIME 模块加载直接失败，硬要求）、`.json → application/json`、`.css → text/css`、`.wasm → application/wasm`、图片资产等 |
| 缓存 | `Cache-Control: no-store` + `ETag: mtime`（本地磁盘读无成本，缓存一致性坑不值当） |
| 方法 | 仅 GET，其余 405；错误统一 403/404 不回内省信息 |
| renderer origin | 生产建议自定义 `app://` 加载 renderer 而非 `file://`（fetch/CSP/相对解析行为一致），dev 为 vite server URL——壳层内部约定，sources 层无感知 |

## 8. watch 热更取舍：变更检测 + 提示重启，不做真热重载

通道（M2）：`chokidar(插件根) → debounce 300ms → 重扫比对 → webContents.send('plugins:changed', ids) → preload → sources/desktop.ts 包装 → plugin store dirDirty ref → 插件管理面板徽标 + toast`。

**M2 main 侧已实现（`electron/main/pluginWatch.ts`，纯逻辑与接线分层）**：
- 纯逻辑三导出（可单测，不触 electron/chokidar）：`fingerprintInfo`（单插件指纹 = entry 文件名 + manifest 可见字段 + error + **入口文件内容 sha1 hash**）、`diffPluginSnapshots`（增/删/指纹变，输出按 id 字典序稳定）、`createDebouncer`（ms 窗口重置式）。
- `startPluginWatching()`（main/index.ts 在 app ready 后调用）：先 `mkdirSync(pluginsRoot(), { recursive: true })` 保证根存在（生产首跑 userData/plugins 可能不存在）→ `rescan()` + `getPluginDir` 建基准快照 → `chokidar.watch(root, { ignoreInitial: true, depth: 1, awaitWriteFinish: { 150, 50 } })` 五类事件共用 300ms debouncer → 触发时重扫（`rescan()` 同步刷新协议白名单）重建快照 → diff → **ids 非空才** `webContents.send(IPC.CHANGED, ids)`（getAllWindows 过滤 destroyed）。
- 指纹含入口内容 hash 的原因：纯 ids/manifest 快照看不出**同 id 的 plugin.js 内容修改**；hash 让「改」可检测。代价是 touch 后内容未变的噪音不推送——这正是「重扫比对」防误报的意义。
- chokidar 是 ESM-only 包，esbuild `bundle: true`（dev watch 与 build-electron 同构）自动打进 main.cjs，无需 runtime 依赖。

**M2 renderer 侧已实现（消费链路）**：
- `sources/desktop.ts` 追加 `subscribePluginChanges(cb)` 导出（无桥 no-op；有桥转发 `bridge.onPluginsChanged`），经 `sources/index.ts` re-export——**桥访问唯一性不变**（红线 1，store 只 import sources 聚合层）。
- `stores/plugin.ts`：`dirDirty`/`changedIds` ref；`init()` 开头（桌面运行态）订阅推送**仅置脏**（不做热重扫/热卸载，与"重启生效"语义一致；应用生命周期不退订）。
- 全局轻提示：`AppShell.vue`（NMessageProvider 后代常驻组件）watch `dirDirty` → `message.info(t('plugin.dirChanged'), { duration: 5000, closable: true })`——非阻塞 toast，不打断进行中编辑（验收项）。
- 面板徽标：`PluginsSection.vue` 提示行右侧 `NTag warning`「目录有变更」（`dirDirty` 为 false 时永不渲染，web 全程无感知——验收项）。
- 文案 `plugin.dirChanged`/`plugin.dirDirty` 双语同构（zh-CN/en-US）。

**真机验收注记（M2 收尾，agent 无法验证渲染，须人工）**：重启 `npm run dev` 后依次验证——
① **改**：编辑 `plugins/ai/plugin.js`（或 manifest.json）内容保存 → 约 0.5s（300ms debounce + awaitWriteFinish 稳定窗）后出现 toast「检测到插件目录变更，重启应用后生效」+ 设置面板「目录有变更」warning 徽标；
② **增/删**：`plugins/` 下复制出一个完整插件目录或删除一个 → 同样提示（空目录无入口文件不产生条目，不提示属预期）；重启应用后变更生效（新插件出现在列表，删除的消失）；
③ （web 感知项已随纯桌面收敛删除——无 web 形态。）

**只做提示的理由**：真热卸载需要运行期下线链路（回滚 UI 注册 + additions 键处置 + undo 栈中插件写入语义 + 快捷键回收 + 浮动层状态），每项都是状态残留风险源，与既有"启停仅意愿 → 重启生效"的收敛决策冲突；提示式覆盖 80% 价值，剩余 20%（插件作者迭代）由"重启 2 秒"兜底，dev 下内置插件仍有 Vite HMR。通道先就位，未来做真热重载只换 `dirDirty` 的消费动作，无返工。UI 态不入 undo、不持久化。

## 9. 构建与脚本

**取舍：vite 手工多配置，不用 electron-vite。** electron-vite 强制 renderer 迁入 `src/renderer/`，会击穿现有全部路径约定（tsconfig include、AGENTS.md 目录表）；`vite.config.ts` 改为 mode 分流的函数式配置（§6 SDK 单实例：dev alias/exclude、build external），renderer 构建语义不变。main/preload 用 esbuild 直出 `.cjs`（`"type": "module"` 下规避 ESM 兼容噪音；preload CJS + contextBridge 兼容 sandbox）。

```jsonc
// package.json scripts 最终形态（纯桌面包，web 形态已移除）
{
  "dev": "node scripts/dev.mjs",                    // AI 插件打包 + vite + esbuild watch main/preload + spawn electron
  "build": "vue-tsc --noEmit && vite build && node scripts/build-electron.mjs",  // renderer + vendor + main/preload 单链路
  "test": "vitest run --passWithNoTests",
  "type-check": "vue-tsc --noEmit && tsc -p tsconfig.electron.json"
}
```

- 产物：renderer `dist/`（宿主 chunk 含 SDK bare import、零插件内容，供 main 以 `app://` 加载）；main/preload `dist-electron/main.cjs`、`preload.cjs`；SDK vendor `dist/vendor/*.js`（import map 解析 bare import，SDK 单实例）；AI 插件产物 `plugins/ai/plugin.js`（gitignored，`package-plugin.mjs` 产出）。web 静态清单 `plugins/index.json` 已不再维护。
- dev 协同（`scripts/dev.mjs`）：① vite lib build 打包 AI 插件 → `plugins/ai/plugin.js`（external=SDK_VENDOR；独立 lib 配置文件，复用 `@vitejs/plugin-vue` 支持 SFC；产物 gitignored；每次 dev 启动重打一次、不做 watch）→ ② spawn vite → ③ 等就绪 → ④ esbuild watch `electron/main` + `electron/preload` → ⑤ `VITE_DEV_SERVER_URL=…` spawn `electron .`。main 改动 → esbuild 重建 → M1 手动重启 electron 进程（main 热重启自动化列 M4）；renderer 改动走 vite HMR。
- devDeps 增量：`electron`、`esbuild`、`chokidar`（electron-builder 属 M4）。不引入 concurrently/wait-on。
- `tsconfig.electron.json`（新）：node 风格 + `types: ["node"]` + lib 含 DOM（bridge.ts 的 `declare global` 引用 Window）+ include `electron/**`、`scripts/**`。

## 10. 架构红线（每阶段验收项）

1. **`window.aideaDesktop` 全 renderer 仅 `src/plugin/sources/desktop.ts` 一处**——验收：`rg "aideaDesktop" src/` 只允许 1 个文件命中（含类型 import）。
2. **IPC 契约窄化**：通道白名单 = `plugins:list` / `plugins:changed`（M3 加 `plugins:compile`）；preload 永不暴露 fs/path/任意路径参数；新增通道须在 `electron/shared/bridge.ts` 集中评审。
3. **插件 SDK 零 Node**：`adapter.ts` 及其 re-export 面不得出现任何 Node/electron import；`SDK_VENDOR` 只增不减。
4. ~~web 版始终可构建且功能不降级~~（**已随纯桌面收敛作废**）：web 形态（dev:web / web 清单源 / 无桥降级）已移除，改为「桌面 logo 启动即正常」的人工冒烟。
5. **插件代码不感知宿主形态**：`AideaPlugin` 契约不动；同一 bundle 在桌面 dev / 生产与未来远程源下行为一致；禁探测桥分叉（红线 1 的镜像约束）。
6. **`manager.ts`/`adapter.ts` 不 import 桥**：跨界形状只有 `PluginEntry[]`——`rg "shared/bridge" src/` 只允许 `sources/desktop.ts` 命中。
7. **协议 handler 是唯一文件读取面**：traversal 测试用例 M1 必须存在且永在。
8. **装载唯一路径（宿主构建零插件）**：编译期 glob 内置源已废除——纯桌面形态仅桌面源（桥扫描 + 协议装载），web 静态清单源已删除。验收：`rg "import.meta.glob" src/` 零命中；`dist/` 无插件 chunk；插件记录不存在 `source: 'builtin'`。
9. **SDK 单实例**：`SDK_VENDOR` 四包全仓库共享同一模块实例——dev 走 vite 原生模块图（插件 transform 装载，不经 import map）；生产宿主 build external、vendor 四包互相 external（自身除外）+ vue feature flags，bare import 统一经 import map。验收：宿主产物保留 bare import 且不含 SDK 源码；vendor 产物内无嵌套 SDK 副本。

## 11. 阶段划分与验收

| 阶段 | 内容 | 验收（type-check 零错 + test 全绿 + 真机人工验证） | 发布度 |
|---|---|---|---|
| **M1** | 壳（main/preload/窗口/双环境加载）+ 协议 + traversal 防护 + vendor/import map + sources 拆分/async 聚合/运行时装载（桌面扫描；web 清单源已删除）+ SDK 单实例构建分流 + layout 回填重清洗 + 契约 v1 + AI 插件打包管线 + `PluginRecord.source` 展示 | ① electron dev 与生产 `app://` 双跑，**AI 插件行为一致**（桌面 = 扫描 + 按 `location.protocol` 分支装载——dev 经 dev-server URL transform、生产经 `aidea-plugin://` 协议，见 §6）；② 以 AI 插件为对象验证装载全链路：活动栏出现、可拖拽、重启后布局位置保留（禁用→启用循环再验一次）；③ 插件管理面板显示 `source: local` | 内部 dogfood，功能完备性达决策目标 |
| **M2** | chokidar watch + 变更提示 | 增/删/改插件目录均触发提示；提示不打断进行中编辑 | ✅ 已实现（agent 侧双绿） |
| **M3** | TS 源直载（main esbuild，external=SDK_VENDOR，产物缓存 by mtime，`DesktopPluginInfo.error` 透出） | 手写 `index.ts` 免构建装载；编译错误显示在插件管理面板；web 契约文档标注"TS 直载为桌面独有" | 实验特性，可无限期推迟 |
| **M4** | electron-builder（NSIS + dmg，asar）+ 插件根迁移 userData + main 热重启打磨 +（后置）electron-updater / mac 签名（个人工具可宣布跳过并文档化绕过） | 双平台安装包实测；asar 与路径相关行为实测 | 正式分发 |

> 说明：项目唯一的官方插件是 `plugins/ai/`（AI 画词/生成/连线设置等），"官方"指"随仓库分发"，与第三方插件地位相同。统一到 `plugins/` 后 AI 插件是目录装载机制的首个真实验证载体：`index.ts` 源码（类型检查与测试面）+ `plugin.js` 产物（两形态装载入口，构建脚本产出、gitignored）——M1 不再需要任何临时示例插件（原 hello 方案废除）。

## 12. 与既有架构的接缝总结

本次实施对既有架构的全部侵入 = 一个函数签名 async 化 + 一个 store 字段 ref 化 + 一处 await + `vite.config.ts` 的 mode 分流；其余为新增文件。实施纪律的核心：**别让壳层知识漏进 `sources/` 以外的任何文件**；宿主构建永不接触 `plugins/` 内容，插件装载只有"启动时扫描/清单"一条路径。
