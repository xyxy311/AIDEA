# Agent MCP 接入

AIDEA 内置一个 **MCP 服务器**（本地 Streamable HTTP），任意 MCP 客户端（Claude Code / Claude Desktop / Cursor / VS Code / MCP Inspector 等）可以读取并修改当前打开的项目：查整板结构、按视图读文本、批量建节点与连线、打标签、切换视图、undo/redo、截图画布。

- 每一次 AI 改动都**可撤销**（写路径统一经命令层，一次工具调用 = 一条历史，用户 Ctrl+Z 或模型调 `aidea_history` 均可回退）。
- 零安装、随 app 分发：设置里打开开关，复制一行客户端配置即可用。
- 决策定稿见 `plan/Agent-MCP接入方案.md`。

---

## 1. 快速开始

### 1.1 启用

1. 打开 **设置 → Agent MCP**，打开「启用 MCP 服务器」开关（默认关）。
2. 复制「客户端配置片段」（设置面板一键复制），粘贴到 MCP 客户端配置；或手动填写：

```json
{
  "mcpServers": {
    "aidea": {
      "url": "http://127.0.0.1:9876/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

要点：

- **仅监听 `127.0.0.1`**（不暴露局域网）；端口可在设置里改，被占用即报错、不静默换端口。
- **token** 随机生成，存 `userData/mcp.json`；设置面板可查看 / 复制 / 重置（重置即断开所有客户端，需同步更新客户端配置）。
- 关闭开关 = 立即停止监听、断开所有客户端。
- 客户端必须支持**自定义请求头**（Bearer token）；仅支持 stdio 的老客户端无法直连（本方案不做 stdio 传输）。

### 1.2 各客户端配置示例

> 客户端配置入口随版本演进，以下为通用形态；核心契约始终是 **URL = `http://127.0.0.1:<port>/mcp` + 请求头 `Authorization: Bearer <token>`**。

**Claude Code**（CLI 或项目 `.mcp.json`）：

```bash
claude mcp add --transport http aidea http://127.0.0.1:9876/mcp --header "Authorization: Bearer <token>"
```

或在项目根 `.mcp.json`：

```json
{ "mcpServers": { "aidea": { "type": "http", "url": "http://127.0.0.1:9876/mcp", "headers": { "Authorization": "Bearer <token>" } } } }
```

**Cursor**（`~/.cursor/mcp.json` 或项目 `.cursor/mcp.json`）：

```json
{ "mcpServers": { "aidea": { "url": "http://127.0.0.1:9876/mcp", "headers": { "Authorization": "Bearer <token>" } } } }
```

**VS Code**（Copilot MCP，`.vscode/mcp.json`）：

```json
{ "servers": { "aidea": { "type": "http", "url": "http://127.0.0.1:9876/mcp", "headers": { "Authorization": "Bearer <token>" } } } }
```

**MCP Inspector**（联调利器）：

```bash
npx @modelcontextprotocol/inspector
```

UI 里 Transport Type 选 **Streamable HTTP**，URL 填 `http://127.0.0.1:9876/mcp`，Header 加 `Authorization: Bearer <token>`，Connect 后即可逐个调用工具。

**Claude Desktop**：经「设置 → 连接器 / Connectors」添加自定义连接器填入 URL。注意 Desktop 对自定义 header 的支持以当前版本为准；若无法携带 Bearer 头，请改用上述任一客户端。

### 1.3 多窗口与 windowId

每个 app 窗口是一个独立项目实例。工具入参均带可选 `windowId: number`（main 在转发前取出剥离，不会进入工具逻辑）：

- 缺省 → 路由到**最近聚焦窗口**；
- 显式指定 → 精确路由（先用 `aidea_windows_list` 拿 id；`toolReady: false` 的窗口未就绪，会被拒绝）。

---

## 2. 协议与返回约定

- 传输：**本地 Streamable HTTP**（无状态），JSON-RPC 2.0，单 JSON 响应（无 SSE 流）；`notifications/*` 返回 202。
- 方法面：`initialize` / `tools/list` / `tools/call` / `resources/list` / `resources/read` / `ping`。`tools/list` 恒定不随连接变化（无状态修订语义）。
- 工具结果统一为 `content: [{ type: 'text', text: <JSON 字符串> }]`（截图例外，返回 image content）。
- 失败一律 `isError: true` + 单行英文错误文本，不抛裸异常。
- **undoHint**：写工具成功且产生了历史时，返回载荷附带 `undoHint`（如 "Added 1 undoable history entry; revert with aidea_history {action:\"undo\"} or the user's Ctrl+Z."）。模型可主动撤销，或提示用户 Ctrl+Z。
- 所有工具均接受可选 `windowId`（见 §1.3）。

---

## 3. 工具参考（21 个）

风险分级：**读**（只读）/ **写**（可撤销写）/ **破坏性**（写且删除内容；描述内含安全指引，仅在用户明确要求时使用）。

### 3.1 读（T1–T4）

#### T1 `aidea_board_overview`（读）—— 一次调用建立心智模型

入参：无。

返回：

```json
{
  "projectName": "需求梳理",
  "dirty": true,
  "stats": { "totalNodes": 42, "maxDepth": 3, "totalReferences": 5, "tagCounts": { "<tagId>": 7 } },
  "view": { "viewedNodeId": "root", "isMain": true, "pathTitle": "/需求梳理", "childCount": 8, "connectionCount": 3 },
  "selection": { "nodeIds": [], "connectionIds": [] },
  "viewport": { "x": 0, "y": 0, "scale": 1, "gridMode": false, "inlineViews": ["<nodeId>"] },
  "tags": [{ "id": "<tagId>", "name": "重要", "color": "#4fc3f7" }],
  "nodePresets": [{ "id": "<presetId>", "name": "默认", "borderColor": "#d1d5db" }],
  "connectionPresets": [{ "id": "<presetId>", "name": "流程", "lineStyle": "solid", "strokeColor": "#6b7280", "directed": true }],
  "limits": { "maxOpsPerBatch": 100, "maxNodesPerCreate": 200, "maxDeletesPerCall": 200 }
}
```

用途：后续工具引用的 tag id / preset id / 当前视图节点 id 都在这里拿。

#### T2 `aidea_view_read`（读）—— 读一个视图的结构化文本

入参：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `nodeId` | string | 当前视图 | 读该节点的直接子级视图 |
| `includeIds` | boolean | `true` | 单元格带 `[nodeId]` 前缀（模型可直接引用 id 调其它工具） |
| `includeCoordinates` | boolean | `false` | 单元格带 `[x,y]` 坐标前缀 |
| `maxNodes` | integer 1–2000 | `300` | 编入文本的最大节点数（超出截断） |

返回：`{ viewedNodeId, titlePath, text, rows: [{index, nodeIds[]}], nodes: [{nodeId, firstLine, x, y, width, height, childCount}], connections: [{id, fromNodeId, toNodeId, text}], nodeCount, truncated }`

- 文本按**直线命中（lineHit）**算法编排：行间 `\n`、行内 ` | `，行内按 x 升序。
- **无需解析文本**：`rows`/`nodes` 已给出每行的节点 id 与几何信息；`connections` 是该视图的同级连线。
- `titlePath` 为祖先链路径（如 `/需求梳理/登录模块`）。

#### T3 `aidea_node_get`（读）—— 节点详情

入参：`{ nodeId }`。

返回：`{ node: {id, parentId, x, y, width, height, text, borderColor, tagIds[]}, parentId, pathToRoot: [首行...], children: [快照], connections: [...], tagIds, referenceName }`（`referenceName` 为 `#引用名`，无则 null）。

#### T4 `aidea_node_search`（读）—— 搜索节点

入参：`{ query, scope?: 'all'|'text'|'tag'|'reference', limit?: 50 (≤200) }`。

返回：`{ matches: [{ nodeId, firstLine, path, matched }], total }`（`path` 为祖先链，`matched` 为命中片段：文本行 / 标签名 / `#引用名`）。大小写不敏感子串匹配。

### 3.2 写（T5–T18，全部可撤销）

> 一次工具调用 = 一条历史（`aidea_batch` 整批一条）。文本用 `\n` 换行；节点文本以 `#` 开头会定义引用名（重名冲突见 T6）。

#### T5 `aidea_node_create`（写）—— 批量创建节点

| 参数 | 说明 |
|---|---|
| `parentId` | 目标父节点 id（其视图内创建） |
| `texts` | string[]，1–200 项，每项一个节点（支持多行） |
| `layout` | `auto`（默认：现有子节点包围盒下方一行）· `grid`（⌈√n⌉ 列网格）· `row`（单行） |
| `gap` | number，默认 24（px 间距） |
| `startAt` | `{x,y}`，显式左上角起点（覆盖 auto 基准） |
| `borderColor` | hex，可选（缺省取当前节点预设） |

返回：`{ createdIds: string[], undoHint }`。

#### T6 `aidea_node_set_text`（写）—— 批量改文本

入参：`{ updates: [{nodeId, text}] }`（1–200 项）。引用名重名**不中断**：冲突项跳过并结构化返回。

返回：`{ applied, conflicts: [{nodeId, conflictRef}], undoHint }`。

#### T7 `aidea_node_delete`（破坏性）—— 删除节点

入参：`{ nodeIds: string[] }`（**含各自子树**一并删除；子树展开计数 ≤ `maxDeletesPerCall`=200，否则报错）。

返回：`{ deletedIds, deletedCount, undoHint }`。

#### T8 `aidea_node_move`（写）—— 移动节点

入参：`{ nodeIds, mode: 'delta'|'absolute', dx?, dy?, positions?: [{nodeId,x,y}] }`。`delta` 按位移整体平移；`absolute` 逐点放置（坐标为左上角，世界坐标 px）。

返回：`{ moved, undoHint }`。

#### T9 `aidea_node_arrange`（写）—— 排布子节点

入参：`{ parentId, arrangement: 'grid'|'row'|'column', gap?: 24, includeConnections? }`（纯几何重排：只移动不增删；`includeConnections` 预留，连线自动跟随节点）。

返回：`{ arranged, moved, undoHint }`。

#### T10 `aidea_node_reparent`（写）—— 跨父迁移

入参：`{ nodeIds, newParentId, position?: {x,y} }`（position 为全部迁移节点的共同落点；内部连线随迁、外部连线删除；防环校验内置）。

返回：`{ undoHint }`。

#### T11 `aidea_node_group`（写）—— 组合

入参：`{ nodeIds: string[] (≥2), title?: '组合' }`。创建容器节点并把节点挂入其下（内部连线保留）。

返回：`{ groupNodeId, undoHint }`。

#### T12 `aidea_connection_add`（写）—— 创建连线

入参：`{ parentId, fromNodeId, toNodeId, lineStyle?: 'solid'|'dashed'|'dotted', strokeColor?, directed?, text? }`。两端必须是 `parentId` 的**直接子节点**（连线表示同级关系）。

返回：`{ connectionId, undoHint }`。

#### T13 `aidea_connection_remove`（破坏性）—— 删除连线

入参：`{ connectionIds: string[] }`（跨父级自动定位）。返回：`{ removed, undoHint }`。

#### T14 `aidea_connection_update`（写）—— 批量改连线

入参：`{ connectionIds, patch: { lineStyle?, strokeWidth? (1–10), strokeColor?, directed?, text? (string|null，null 清空文字) } }`。

返回：`{ updated, undoHint }`。

#### T15 `aidea_tag_apply`（写）—— 打标签

入参：`{ nodeIds, tagNames: string[], mode?: 'append'(默认，保留既有)|'replace'(整体替换) }`。缺失的标签定义自动创建（**定义层不可撤销**——回滚后定义保留，节点关联可撤销）。

返回：`{ tagIds, createdTags: [{id,name,color}], undoHint }`（`tagIds` 为本次解析出的标签 id，非节点最终集合）。

#### T16 `aidea_view_switch`（写）—— 切换视图

入参：`{ nodeId }`。切换主视图到该节点（其直接子级成为视图内容；视图态不入历史）。

返回：`{ viewedNodeId, isMain, undoHint }`。

#### T17 `aidea_history`（写）—— 撤销 / 重做

入参：`{ action: 'undo'|'redo'|'status' }`。返回：`{ canUndo, canRedo, action, undoHint }`。

#### T18 `aidea_batch`（破坏性）—— 原子批量执行

入参：`{ ops: [{tool, args?}] }`（1–100 项；仅写工具，禁嵌套 batch）。

- 全部成功：所有 op 合并为**一条历史**，返回 `{ ok: true, results: [{tool, ok, payload}] }`；
- 任一中途失败：**整体回滚**（数据无残留、历史无新增），返回 isError 内容 `{ ok: false, results, failedAt, failedTool, error }`；
- 例外：批内新建的标签定义保留（定义层不可撤销）。

### 3.3 附加（T19–T21）

#### T19 `aidea_tag_list`（读）—— 标签字典

入参：无。返回：`{ tags: [{ id, name, color, nodeCount }] }`。

#### T20 `aidea_screenshot`（读）—— 画布截图

入参：`{ mode?: 'viewport'(默认)|'board', maxWidth?: 1600 (200–4000) }`。

返回 `content: [{ type: 'image', data: <base64 PNG>, mimeType: 'image/png' }]`。`board` 模式按全部节点包围盒裁剪；输出宽度按 `maxWidth` 归一（总像素上限约 16M 自动降采样）。窗口最小化/隐藏时画布无尺寸会报错（见 §7）。

#### T21 `aidea_windows_list`（读）—— 窗口清单

入参：无。main 本地应答。返回：`{ windows: [{ windowId, focused, projectName, dirty, toolReady }] }`。

---

## 4. Resources（3 个）

| URI | mime | 内容 |
|---|---|---|
| `aidea://project/current` | `application/json` | 当前项目序列化（与保存的 `.aidea.json` 同构） |
| `aidea://view/current` | `text/markdown` | 当前主视图的结构化文本（同 T2 默认参数） |
| `aidea://board/tags` | `application/json` | 标签字典（同 T19，便于客户端缓存） |

同步按需生成（读取时 renderer 执行），无订阅/推送。

---

## 5. 常见任务手册（写给 Agent）

**建立心智模型**：`board_overview` → `view_read`（当前视图）→ 需要时 `view_read{nodeId}` 下钻或 `node_search` 定位。

**批量建一张子图**：`node_create{parentId, texts:[...]}` → 记下 `createdIds` → `connection_add` 连线 → `tag_apply` 打标 → `screenshot` 自检。一步到位可用 `batch` 把后三步打包成原子操作。

**修改既有内容**：`node_search` / `view_read` 拿 id → `node_set_text`（注意 `conflicts` 返回）→ `node_move` / `node_arrange` 调整布局。

**跨视图操作**：内联展开的子视图内容不在主视图文本里——用 `node_get{nodeId}` 拿 `children`，或 `view_read{nodeId}` 读该子视图；迁移用 `node_reparent`。

**改错了**：`aidea_history{action:'undo'}`（可连续撤销）；也可提示用户 Ctrl+Z。

---

## 6. 安全模型与护栏

1. **总开关默认关**：不开不监听端口，请求通道不会被调用。
2. **仅绑 `127.0.0.1`** + **Origin 校验**：无 Origin（CLI/桌面客户端）放行；有 Origin 且非本机回环 → 403（防 DNS rebinding）。不返回任何 CORS 头。
3. **Bearer token**：32 字节随机（base64url），存 `userData/mcp.json`；设置面板可查看/复制/重置。
4. **上限护栏**（`mcp.json` 的 `limits`，可手改文件，越界启动时收敛）：

   | 项 | 默认 | 说明 |
   |---|---|---|
   | `maxOpsPerBatch` | 100 | 单次 batch 的 op 上限 |
   | `maxNodesPerCreate` | 200 | 单次建节点 / 单次排布的节点数上限 |
   | `maxDeletesPerCall` | 200 | 单次删除的节点数上限（含子树展开） |
   | `toolTimeoutMs` | 60000 | 单次工具调用超时（main 计时） |
   | `maxConcurrent` | 4 | 全局并发调用上限 |
   | `maxCallsPerMinute` | 120 | 每客户端 60s 滑动窗口调用上限 |

   超限返回结构化错误（HTTP 429 / -32000），不静默截断。
5. **调用日志**：每次调用记录 `{time, tool, argsDigest(截断), durationMs, ok, error}`，ring buffer 100 条，设置面板可查。
6. **可撤销性**：写工具一律经命令层；见 §2 undoHint。
7. **破坏性工具描述内含安全指引**（仅在用户明确要求时使用；先 overview 再动）。
8. 不做：工具白名单开关矩阵、写审批弹窗、远程/局域网暴露、`fs` 域、prompts 原语。

---

## 7. 故障排查

> 联调推荐先用仓库自带的调试客户端 `tools/mcp-cli.mjs` 自检（零依赖，自动读取 mcp.json 的端口与 token）：`npm run mcp:cli -- ping`。支持 `tools` / `call <tool> [json|@file]` / `shot` / `repl`（交互模式）/ `demo`（模拟一次 Agent 小流程），详见 `node tools/mcp-cli.mjs help`。

| 现象 | 排查 |
|---|---|
| 客户端连不上 | 设置面板确认开关与状态（运行中/端口）；核对客户端 URL 与 token；`curl -X POST http://127.0.0.1:9876/mcp -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"ping"}'` 应返回 `{"jsonrpc":"2.0","id":1,"result":{}}` |
| 401 | token 不匹配（重置后需同步更新所有客户端） |
| 403 | 客户端带了非本机回环的 Origin |
| 405 | 只允许 `POST /mcp`（无状态模式无 GET/SSE） |
| 429 | 并发或频率超限，稍后重试 |
| 工具调用超时 / not_ready | 目标窗口 renderer 未就绪（启动早期 / 设置面板刚加载）；重试 |
| `no window with id N` | 窗口已关闭，重新 `aidea_windows_list` |
| 端口占用报错 | 换端口或释放占用；不静默换端口 |
| 截图为空/报 zero size | 窗口最小化或隐藏时画布无尺寸；恢复窗口后重试 |
| undo 没有完全还原 batch | 批内新建的标签定义保留（定义层不可撤销，见 T15/T18） |
| 文本没进历史 | `view_switch` 只切视图不入历史（视图态） |

---

## 8. 架构

```
MCP 客户端 ──POST /mcp（JSON-RPC 2.0 + Bearer）──▶ main（electron/main/mcp/）
  server.ts   http.createServer；Origin/token 校验；仅 POST /mcp
  rpc.ts      纯函数分派：initialize / tools/* / resources/* / ping；版本协商
  toolBridge.ts  main→renderer 请求-回执 pending map；窗口路由；超时
  config.ts   userData/mcp.json 读写 + token 生成
  limiter.ts  并发 + 频率护栏
        │  第 6 座桥 aideaMcp（MCP_REQUEST / MCP_RESPONSE / MCP_PUBLISH_TOOLS / MCP_STATUS / MCP_WINDOW_STATE）
        ▼
renderer（src/mcp/）
  registry.ts  工具登记表（21 工具 + 3 resource，单一数据源）
  host.ts      installMcpHost()：请求处理 / 清单发布 / 窗口态上报 / 调用日志 / undoHint
  schema.ts    最小 JSON Schema 校验器（零依赖）
  viewText.ts  MCP 专用视图转文本（直线命中）
  tools/*      分域 handler：写路径全部经 useCommands（可撤销）
```

- **工具清单唯一数据源在 renderer**（`registry.ts`），启动时经 `aideaMcp.publishTools()` 推给 main 缓存；`tools/list` 由 main 从缓存应答。
- `aidea_windows_list` 由 main 本地应答（窗口集合 + renderer 上报的业务态缓存；windowId 以 webContents 归属盖章，不信任载荷）。
- 生命周期：app ready 后 `initMcp()`（enabled 才 start）；`will-quit` 时 `stopMcp()`（pending 全部失败为 shutting_down）；设置面板改配置即时 stop/start。
- `history.beginBatch` 非重入：`aidea_batch` 事务内子工具经 `ctx.inBatch` 跳过自身 batch 边界。

### 模块索引

| 路径 | 职责 |
|---|---|
| `electron/main/mcp/{server,rpc,toolBridge,config,limiter,index}.ts` | 协议 / 鉴权 / 路由 / 配置 / 护栏 / 装配（rpc·limiter·config 纯函数可单测） |
| `electron/shared/bridge.ts` | `IPC.MCP_*` 通道 + `McpBridge` 等契约 |
| `electron/preload/index.ts` | 暴露 `window.aideaMcp`（host.ts 是全 renderer 唯一访问点） |
| `src/mcp/{registry,host,schema,viewText,types,constants}.ts` | 工具面与宿主 |
| `src/mcp/tools/{board,node,connection,misc}.ts` | 分域 handler |
| `src/components/settings/McpSection.vue` | 设置分区 |
| `tools/mcp-cli.mjs` | 调试客户端（模拟 Agent 调用，零依赖；`npm run mcp:cli`） |
| 测试 | `src/mcp/__tests__/` · `electron/main/mcp/__tests__/` |

---

## 9. 设计决策要点

- **精选 21 个意图级工具**而非 1:1 暴露适配层（11 域 ~136 方法）：模型语用契约 ≠ 插件 SDK 契约，且工具清单直接吃上下文窗口。
- **`src/mcp/viewText.ts` 与 `plugins/ai/utils/viewText.ts` 是有意隔离的两份实现**：消费者/边界/演进节奏不同（面板可调参可试验、MCP 契约求稳）。对照测试 `src/mcp/__tests__/viewText.test.ts` 锁定同一节点集的行分组一致，插件版行为分叉会立刻报红。生产代码（`src/**` 非 `__tests__`）禁止 import `plugins/`。
- **MCP 不是插件**，不占用插件扩展点（未来如开放，必须「内核不变 + `ctx.register.registerMcpTool` 只增」，清单变化走 `publishTools()` 重推）。
- 与内置 `plugins/ai` 互补：`ai` = AIDEA 调外部模型；MCP = 外部 Agent 驱动 AIDEA。二期可让 `ai` 插件复用 `src/mcp/registry.ts` 的工具定义。
