# Electron 桌面架构

> 本应用是**纯 Electron 桌面应用**。本文档面向 AI / 开发者在最短时间内建立对代码架构的准确认知：进程边界是谁、桥契约在哪、插件系统如何从启动一路装载到渲染。

## 1. 核心架构

Electron 只是一个**外壳**：全部应用逻辑（画布、节点树、undo/redo、插件系统）都在 renderer 的 Vue3 + Pinia 里，与浏览器运行时完全一致。进程分工是围绕「renderer 拥有全部逻辑、绝不触碰文件系统 / Node」这条边界展开的：

- **main 进程**（`electron/main`）：宿主壳。负责开窗、插件目录扫描与协议、窗口/文件/IPC 通道、快捷键兜底。**全部文件系统访问收敛在 main**（`dialog` + `fs` + 自定义协议 handler）。
- **preload**（`electron/preload/index.ts`）：contextBridge 暴露五座**窄桥**（`aideaDesktop` / `aideaWindow` / `aideaFile` / `aideaFs` / `aideaI18n`），只转发明文通道，绝不暴露 `ipcRenderer` 本体或任何带物理路径参数的通道。
- **renderer**（`src/`）：纯 UI 与业务逻辑，通过桥与 main 通信；插件系统在 renderer 内装载运行。

整体链路一句话：**main 扫描插件目录 → preload 注入桥 → renderer 启动 `init()` 经桥收集插件条目 → 按运行时 protocol 分支动态 `import()` 插件 bundle → 插件 `ctx.register` 注册 UI → uiRegistry 派生渲染自动生效**。

安全基座：窗口 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`——renderer 零 Node 能力，文件读取唯一的合法路径是自定义协议 handler。

## 2. 相关文件

| 路径 | 职责 |
|---|---|
| `electron/shared/bridge.ts` | IPC 契约全量：`IPC` 通道名白名单 + `DesktopBridge`/`WindowBridge`/`FileBridge`/`FsBridge` + `declare global` 的 `window.aideaDesktop` 等类型声明。main 与 preload 双向 import，除类型与常量外**无运行时副作用**。新通道集中在此评审 |
| `electron/shared/vendor.ts` | SDK 共享契约：`SDK_VENDOR` external 清单 + `VENDOR_FILE` 产物名（须与 `index.html` import map 对齐）。只增不减 |
| `electron/main/index.ts` | main 入口：privileged schemes 注册（app ready 前）→ 删原生菜单 → 开主窗口 → ready 后注册协议/IPC/watch |
| `electron/main/plugins.ts` | 插件扫描壳（唯一 import electron）：`pluginsRoot()`（dev 为 `<仓库根>/plugins/`，打包后 `userData/plugins/`）、`rescan()` 刷新白名单、`getPluginDir()` |
| `electron/main/pluginScan.ts` | 扫描纯逻辑（IO 注入可单测）：入口判定 `plugin.js > index.js > index.mjs`、manifest 校验、产出一条 + 白名单 Map |
| `electron/main/pluginWatch.ts` | chokidar watch + 变更推送：纯函数（fingerprint/diff/debounce）+ 薄接线 `startPluginWatching` |
| `electron/main/fsGuard.ts` | 路径防护纯函数：`isValidPluginDirName` / `decodeProtocolPath` / `resolveSafeFile`（traversal 守门人） |
| `electron/main/protocol.ts` | 自定义协议：`aidea-plugin://` 插件资源 + `app://` renderer 载体，注册与 handler |
| `electron/main/mime.ts` | 协议响应 MIME 推断（.js/.mjs → `text/javascript` 硬要求） |
| `electron/main/ipc.ts` | main 侧 IPC 通道注册：插件 list + 窗口控制 + 项目文件 + 通用任意文件读写（dialog+fs+iconv） |
| `electron/main/shortcuts.ts` | `attachWindowShortcuts`：删菜单后编辑快捷键/devtools 兜底 |
| `electron/preload/index.ts` | contextBridge 露出五座窄桥 |
| `src/composables/useNativeFs.ts` | `window.aideaFs` 桥唯一 renderer 访问点 + 二进制解析原语（`toArrayBuffer`/`bytesToHex`）；`api/fs.ts` 与内置功能共用 |
| `src/plugin/sources/desktop.ts` | **全 renderer 唯一桥访问点**（`window.aideaDesktop`），`collectDesktopEntries` / `subscribePluginChanges` |
| `src/plugin/sources/index.ts` | 聚合收口 `collectPluginEntries` + re-export 订阅；manager 对源内部无感知 |
| `src/plugin/manager.ts` | 插件「加载 + 生命周期」：`PluginManager` / `installAll` / `PluginEntry` / `PluginRecord` |
| `src/plugin/adapter.ts` | 插件 SDK 面（`AideaPlugin` / `PluginContext`），零 Node import |
| `src/plugin/ui.ts` | UI 注册运行时（`createPluginRegister` 等）+ `rollbackPluginUi` |
| `src/stores/plugin.ts` | pinia store：持有 `PluginManager`，`init()` 引导装载，启停持久化，`dirDirty` 订阅 |
| `src/main.ts` | renderer 入口：Konva DPR 设置 → `app.use(pinia)` → mount → `void usePluginStore().init()` |
| `index.html` | import map（`vue/pinia/naive-ui/konva` → `/vendor/*.js`）+ CSP（`script-src` 放行 `aidea-plugin:`/`app:`） |
| `src/stores/layout.ts` | `setDiscoveredPluginIds(ids)`：插件发现集回填后重清洗位置 delta（禁用→启用不丢布局） |
| `scripts/dev.mjs` | dev 编排（见 §4） |
| `scripts/build-electron.mjs` | 生产构建第三段：vendor + AI 插件产物 + main/preload |
| `scripts/vendor.mjs` | SDK vendor 产物生成 + `loadVendorContract`（读 `SDK_VENDOR`） |
| `scripts/package-plugin.mjs` | 内置插件打包 `packagePlugin(id)`（external=SDK_VENDOR，CSS 内联注入） |
| `vite.config.ts` | mode 分流：dev 零 SDK 配置（vite 原生模块图）、build = SDK `rollupOptions.external` |
| `tsconfig.electron.json` | electron 壳的 TS 配置（node 风格，含 DOM lib 供 bridge 的 `declare global`） |

## 3. 关键类型和函数

### IPC 通道常量（`electron/shared/bridge.ts`）

`IPC` 是全体通道名的唯一来源（禁止散落字符串）：插件 `LIST`(`plugins:list`) / `CHANGED`(`plugins:changed`)；窗口 `WINDOW_MINIMIZE` / `WINDOW_TOGGLE_MAXIMIZE` / `WINDOW_CLOSE` / `WINDOW_IS_MAXIMIZED` / `WINDOW_MAXIMIZED_CHANGED`；文件 `FILE_OPEN` / `FILE_SAVE` / `FILE_WRITE` / `FILE_READ`（项目文件）+ `FS_OPEN` / `FS_SAVE` / `FS_WRITE` / `FS_READ`（`fs:*` 通用任意文件读写）。

### 契约类型

```ts
DesktopPluginInfo {
  id: string        // 目录名，强校验 ^[a-z0-9_-]+$，同时是 aidea-plugin://<id>/ 的 host
  entry: string     // 入口文件名（相对插件目录，扫描已定）
  manifest: PluginManifestJSON | null  // 外置清单；null = 装载时读插件内联
  error?: string    // 结构非法等原因；有 error 的条目装载层跳过
}

DesktopBridge {
  kind: 'desktop'
  listPlugins(): Promise<DesktopPluginInfo[]>   // 无参，目录由 main 决定，renderer 永不传路径
  onPluginsChanged(cb: (ids: string[]) => void): () => void  // 返回取消订阅函数
}

WindowBridge { minimize(); toggleMaximize(); close(); isMaximized(): Promise<boolean>;
  onMaximizedChange(cb): () => void }

FileBridge { openProject(); saveProject(opts); writeFile(opts); readFile(opts) }

// 通用任意文件读写（window.aideaFs，同窄桥准则：open/save 对话框定路径，write/read 只收已记忆路径令牌）
type FsMode = 'text' | 'binary'
FsBridge {
  open(req: { mode: FsMode; encoding?: TextEncoding; title?; filters? }): Promise<FsOpenResult>
  save(req: { mode: FsMode; encoding?: TextEncoding; defaultName?; content? / bytes? }): Promise<FsSaveResult>
  read(req: { path; mode: FsMode; encoding? }): Promise<FsReadResult>
  write(req: { path; mode: FsMode; encoding?; content? / bytes? }): Promise<void>
}
// text 载荷 content?: string（按 encoding 用 iconv-lite 编解码，默认 utf-8）；binary 载荷 bytes?: Uint8Array
```

`SDK_VENDOR = ['vue', 'pinia', 'naive-ui', 'konva']`（`electron/shared/vendor.ts`）；`VENDOR_FILE` 给出各包产物文件名。

### 收集侧

```ts
// src/plugin/sources/desktop.ts（全 renderer 唯一桥访问点）
const bridge = window.aideaDesktop          // 模块加载时读一次，非懒取
collectDesktopEntries(): Promise<PluginEntry[]>
subscribePluginChanges(cb): () => void

// src/plugin/sources/index.ts（聚合收口，manager 只调它）
collectPluginEntries(): Promise<PluginEntry[]>

// src/plugin/manager.ts
PluginEntry { id; loader() }
PluginRecord { id; name; version; status; enabled; entry; ... }
```

要义：`sources/desktop.ts` 是把桥形态翻译成 `PluginEntry` 的唯一翻译点——`loader` 按 `location.protocol` 分支产 URL（dev → `/plugins/<id>/<entry>` 根相对，走 vite transform；生产 → `aidea-plugin://<id>/<entry>`）。`collectPluginEntries` 当前只做 `collectDesktopEntries()` 的透传（纯桌面形态单源）。

### watch 纯函数（`electron/main/pluginWatch.ts`）

```ts
fingerprintInfo(info: DesktopPluginInfo, entryHash: string): string
  // 指纹 = entry + manifest(固定键序 JSON.stringify) + error(归一 null) + 入口文件内容 sha1
diffPluginSnapshots(before: Map<id,fp>, after: Map<id,fp>): string[]
  // 增/删/指纹变 → 变更 id 列表（按 id 字典序稳定排序）
createDebouncer(ms, task): { push(); cancel() }
```

接线 `startPluginWatching()`（app ready 后调用一次，返回 stop）：`mkdirSync` 保证根存在 → 建基准快照 → `chokidar.watch(root, { ignoreInitial, depth: 1, awaitWriteFinish })` 五类事件共用 300ms debouncer → 重扫（同步刷新协议白名单）→ 重建快照 → diff → **ids 非空才** `webContents.send(IPC.CHANGED, ids)`（`getAllWindows` 过滤 destroyed）。

### 装载侧（`src/plugin/manager.ts`）

`installAll()`：对每条 entry `loadRecord(entry, enabled)`（读 manifest 建 `PluginRecord`，独立 try/catch 错误隔离，`manifest.id !== entry.id` 校验兜住目录名与内联 id 不符）→ `enabled` 且非 error 才 `activate(id)`。`activate`：`sdkVersion !== SDK_VERSION` 置 error → `plugin.setup(context)`；setup 抛错则 `context.dispose()` + `rollbackPluginUi(id)` 回滚半程注册。

### 布局回填（`src/stores/layout.ts`）

`setDiscoveredPluginIds(ids: string[])`：把插件发现集置为 ref，再以「内置键 ∪ 插件前缀 ∈ 发现集」重清洗各 delta 并 persist——保证禁用→启用不丢布局。

## 4. 组织关系与启动调用链

进程/模块组织：**main（文件系统 + 协议 + IPC）← IPC → preload（窄桥）→ renderer（Vue 全部逻辑）**；`electron/shared/*` 是 main 与 renderer 共享的**纯契约层**。

启动链路分步：

1. **main 启动**（`scripts/dev.mjs` 编排，见下）：`electron/main/index.ts` 顶层 `registerPrivilegedSchemes()`（scheme 特权在 app ready 前固化）→ `Menu.setApplicationMenu(null)`。
2. **app ready 后**：`registerProtocolHandlers()`（`aidea-plugin://` + `app://`）→ `registerIpc()` → `createMainWindow()`（`contextIsolation`/`sandbox`，`preload: dist-electron/preload.cjs`）→ `startPluginWatching()`。
   - dev：`VITE_DEV_SERVER_URL` 存在 → `win.loadURL(devUrl)`；生产 → `win.loadURL('app://./index.html')`。
3. **preload**（`index.ts`）：`contextBridge.exposeInMainWorld` 暴露五座桥（aideaDesktop/aideaWindow/aideaFile/aideaFs/aideaI18n）。注入先于应用脚本，故 renderer 模块顶部可直接读 `window.aideaDesktop`。
4. **renderer**（`src/main.ts`）：`Konva.pixelRatio` → `app.use(pinia)` → `mount('#app')` → `void usePluginStore().init()`。
5. **`init()`**（`src/stores/plugin.ts`）：`subscribePluginChanges`（置 `dirDirty`）→ `await collectPluginEntries()` → `useLayoutStore().setDiscoveredPluginIds(...)`（回填在先，注册前 delta 已正确）→ `new PluginManager({ entries, getEnabled })` → `mgr.installAll()`（装载 → activate → 注册 UI）。
6. **插件装载**：`entry.loader()` 动态 `import(url)`；dev 经 vite transform、生产经 `aidea-plugin://` 协议 → bare import 由 import map 解析到 `/vendor/*.js` → 与宿主共享同一 SDK 实例。

`scripts/dev.mjs` 编排：① `packagePlugin('ai')`（内置插件产物）→ ② spawn vite（`--strictPort` 5173）→ ③ 轮询就绪 → ④ esbuild watch main/preload（直出 `.cjs`）→ ⑤ `VITE_DEV_SERVER_URL` 下 spawn electron。main/preload 改动重建后**需手动重启 electron**（不做热重启）。

## 5. 实现细节与踩坑点

### 通用文件桥 `aideaFs`（任意文件读写）

与项目文件桥 `aideaFile` 平行、但语义面向「任意文件」：支撑插件「导出为文本 / 加载模板 / 读二进制」与未来内置功能。安全模型沿用窄桥红线：

- **dialog + fs 全在 main**：`fs:open`/`fs:save` 各带 `async` handler，用 `showOpenDialog`/`showSaveDialog` 选路径后 `fs.readFile/writeFile`；插件只要不传路径，open/save 就一定由对话框定路径。
- **路径即令牌**：`fs:read`/`fs:write` 只接受 `main` 之前（open/save 或其它通道）产出的记忆路径字符串，落盘/重读仍在 main。renderer 从不自造路径、不直接碰磁盘。
- **双编码**：`mode:'text'` + `encoding`（缺省 utf-8）经 `iconv-lite` 编解码（`encodingExists` 兜底，非法抛错）；支持 gbk/gb18030/big5/shift_jis/utf-16le 等，GBK 场景不会乱码。`mode:'binary'` 把 Node `Buffer` 以 `Uint8Array` 返回（IPC 结构化克隆），写侧 `Uint8Array`→`Buffer` 落盘，用户格式解析由调用方自理。
- **依赖**：`iconv-lite`（纯 JS，无原生模块）例进 esbuild main bundle（`external` 仅 `electron`），已实测 main.cjs 内联。
- **取消语义**：对话框取消静默返回 `{ canceled: true }`，不抛错；整文件进内存，未做流式（50MB 软上限建议写进插件侧）。

### 自定义协议 `aidea-plugin://`

- **特权注册**：`protocol.registerSchemesAsPrivileged` 在 app ready 前调用；`standard: true`（相对路径解析前提）、`secure`、`supportFetchAPI`（`import()` 前提）、`stream`、`corsEnabled`（跨 origin module import 前提）。
- **URL 规则**：`aidea-plugin://<pluginId>/<相对路径>`，`host` 小写化兜底，映射 `<插件根>/<pluginId>/<相对路径>`；**URL 永不含物理路径**。
- **白名单访问控制**：handler 先查扫描白名单 Map（`getPluginDir`），id 不在白名单一律 403，杜绝任意目录读。
- **traversal 防护**（`fsGuard.resolveSafeFile`）：先 `decodeURIComponent`（编码 `%2e%2e` 绕过字面检查）→ 拒空/仅斜杠/根相对/绝对路径（含 Windows 盘符）/URL 分隔符开头 → `resolve` 归一 → 结果必须以 base `resolve` 前缀**含分隔符**开头（否则 `/plugin-a` 会误放 `/plugin-a2`，前缀相似目录逃逸）；失败统一 403 不回内省信息。MIME 由 `mime.ts` 推断，`.js/.mjs` 必须 `text/javascript`（缺 MIME 模块加载直接失败）。
- **响应**：仅 GET（其余 405）；`Cache-Control: no-store` + `ETag: mtime`（本地磁盘读无成本，缓存一致性坑不值当）；`Access-Control-Allow-Origin: *`（module import 是 CORS 模式请求）。
- **`app://`**：生产用 `app://./index.html` 加载 renderer，刻不意用 `file://`（origin 为 null 致 CORS/ESM/相对解析行为不一致）；与 `aidea-plugin` 同款 privileges。

### SDK 单实例

插件 bundle 必须与宿主共享同一 `vue/pinia/naive-ui/konva` 模块实例（两个 Vue 副本 = 组件上下文断裂）：

- **dev**：走 vite 原生模块图——插件经 dev-server URL transform 装载，与宿主共享预打包产物，**不经过 import map**。`vite.config.ts` 刻意不用 `resolve.alias` 归一 SDK 到 `/vendor/*.js`（alias 值按文件路径继续 resolve，会 Pre-transform error）。
- **生产**：宿主构建把这些依赖 `rollupOptions.external`（宿主产物保留 bare import、零 SDK 内容），插件协议原生加载 → 两者 bare import 统一由 `index.html` import map 解析到 `dist/vendor/*.js`。
- **vendor 产物**（`scripts/vendor.mjs`）：esbuild 把每包 bundle 成单文件 ESM；**四包互相 external**（自身除外）——naive-ui/pinia 内部 `import 'vue'` 保留 bare 由 import map 网状解析，vendor 内不嵌第二份 vue；注入 vue esm-bundler feature flags（`__VUE_OPTIONS_API__` 等，vendor 不经 vite 编译，缺 flag 直接 ReferenceError）与 `process.env.NODE_ENV`。

**两个判据踩坑**：① 判别装载分支**勿用 `import.meta.env.DEV`**——vite 6 dev 下它是模块顶部注入的运行时对象而非编译期替换，真机 Electron dev renderer 里求值不可靠（实测落 false → 误走协议分支 → 双 SDK 实例 → `useStore` 崩）；正确判据是 `location.protocol === 'http:' || 'https:'`。② vendor 的 default 导出写成 `(ns).default ?? ns`，绝不能把 namespace 直接设为 default（对 CJS/UMD 包 esbuild 会包装出只读 namespace，宿主 `Konva.pixelRatio = ...` 直接 TypeError 白屏）。

### 插件目录 dev/prod 同构

dev 插件根 `<仓库根>/plugins/`，生产 `userData/plugins/`——两形态目录结构一致，统一为**应用启动时扫描**装载。目录名 = pluginId（强校验 `^[a-z0-9_-]+$`，非法子目录扫描期跳过）；入口判定 `plugin.js > index.js > index.mjs`，无入口的目录被天然跳过。`manifest.json` 可选，解析/校验失败条目带 `error` 但不中断。内置 AI 插件也打包出 `plugins/ai/plugin.js`（gitignored），与第三方地位一致。

### watch 只提示、不热重载

入目录变更只置 `dirDirty` + toast「重启后生效」，**不做真热重载**：真热卸载需要运行期下线链路（回滚 UI 注册 + delta 处置 + undo 语义 + 快捷键回收 + 浮动层状态），每项都是状态残留风险源。提示式覆盖大部分价值，开发者迭代靠重启兜底。指纹含入口文件内容 sha1 hash 的原因：纯 ids/manifest 快照看不出「同 id 仅改 plugin.js 内容」，hash 让「改」可检测；`awaitWriteFinish` + debounce 跳过半成品/合并多次写入。

> 插件 UI 注册 / 面板派生 / 模态与浮动层 / 开发约束分别见 `插件系统.md`、`插件UI注册.md`、`插件模态面板.md`、`插件开发手册.md`。