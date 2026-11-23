# Agent MCP 接入

AIDEA 内置一个 **MCP 服务器**（本地 Streamable HTTP），任意 MCP 客户端（Claude Code / Claude Desktop / Cursor / VS Code / MCP Inspector 等）可以读取并修改当前打开的项目：查整板结构、按「大纲 → 视图 → 单节点」三层读、批量建节点与连线、打标签、切换视图、undo/redo、截图画布。

- 每一次 AI 改动都**可撤销**（写路径统一经命令层，一次工具调用 = 一条历史，用户 Ctrl+Z 或模型调 `aidea_history` 均可回退）。
- 零安装、随 app 分发：设置里打开开关，复制一行客户端配置即可用。
- 决策定稿见 `plan/Agent-MCP接入方案.md`；读侧改版定稿见 `plan/Agent-MCP读接口改版方案.md`。

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
- 工具结果统一为 `content: [{ type: 'text', text }]`（截图例外，返回 image content）。json 形工具的 `text` 为 JSON 字符串；读侧文本工具（`aidea_outline`、`aidea_view_read` 默认格式、`aidea://view/current`）直接返回**纯文本**（链式文本/大纲文本），不再包 JSON。
- 失败一律 `isError: true` + 单行英文错误文本，不抛裸异常。
- **undoHint**：写工具成功且产生了历史时，返回载荷附带 `undoHint`（如 "Added 1 undoable history entry; revert with aidea_history {action:\"undo\"} or the user's Ctrl+Z."）。模型可主动撤销，或提示用户 Ctrl+Z。
- 所有工具均接受可选 `windowId`（见 §1.3）。

---

## 3. 工具参考（22 个）

风险分级：**读**（只读）/ **写**（可撤销写）/ **破坏性**（写且删除内容；描述内含安全指引，仅在用户明确要求时使用）。

读侧为**三层读模型**（见 `plan/Agent-MCP读接口改版方案.md`）：**索引层** `aidea_outline`（树状大纲）→ **内容层** `aidea_view_read`（链式文本）→ **详情层** `aidea_node_get`（单节点全文与精确几何）。大板先 outline 决定要读哪个子视图，再 view_read 该视图，最后 node_get 取单节点细节。

### 3.1 读（T0–T4）

#### T0 `aidea_outline`（读）—— 树状大纲（索引层）

入参：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `rootId` | string | 项目根 | 子树根（句柄 `N<code>` / 唯一显示名 / 完整 id） |
| `depth` | integer 1–10 | `3` | 展开的子层深度 |
| `limit` | integer 1–500 | `50` | 输出行数上限（超限置 truncated 并提示用 `rootId` 下钻） |
| `includeAdditions` | boolean | `false` | 在根行列出插件扩展数据的**键名**（值属插件私有，不暴露） |
| `includeStyles` / `includeTags` | boolean | `true` | 样式名 / 标签名槽位 |

返回（纯文本）：

```
OUTLINE /未命名项目  (深度 3 · 50 行上限)
ROOT Nroo 未命名项目  (+19 子, +19 叶)
  Nabc A 关卡设计 | 主线节点 | 简单  (+3 子, +4 叶)
  Ndef B 备注 | 注释
```

规则：容器行带 `(+K 子, +L 叶)`；叶子默认只计数不列行——例外是某父的子节点**全部**是叶子时列前 5 个叶子名（防"整棵退化成空"）；不输出坐标（几何留给详情层）。句柄与 view_read 同源（全局唯一），可直接传给写工具。

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

#### T2 `aidea_view_read`（读）—— 读一个视图的链式文本（内容层）

入参：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `nodeId` | string | 当前视图 | 视图容器节点（句柄 / 名字 / 完整 id） |
| `label` | `'first' \| 'full'` | `'first'` | `first` = 首行 + `(+K行)` 标记；`full` = 全文 `\n` 转义 |
| `labelMax` | integer 10–200 | `40` | 超长标签截断加 `…` |
| `includeCoords` / `includeTags` / `includeStyles` | boolean | `true` | 坐标 / 标签 / 样式槽位开关 |
| `includeUnlinked` | boolean | `true` | UNLINKED 小节 |
| `unlinkedLimit` | integer 1–200 | `20` | 未连线节点超出折叠为计数行 |
| `filter` | string | — | 名称子串（大小写不敏感）：命中链保留命中节点前后各 1 跳，未连线按名匹配 |
| `maxChains` | integer 1–200 | `40` | 单页链条数（超出置 truncated + `nextAfter`） |
| `after` | integer ≥0 | `0` | 链列表翻页偏移（回传上次响应的 `nextAfter`） |
| `includeLayout` | boolean | `false` | 可选追加旧版 lineHit 行带段（保留能力，默认关） |
| `format` | `'text' \| 'json'` | `'text'` | `json` 为精确逃生口：返回完整结构化数据（无分页/过滤） |

> 已移除旧参数 `includeIds` / `includeCoordinates` / `maxNodes`（被句柄与分页取代；**破坏性变更**）。

返回（text 格式，纯文本）：

```
VIEW /关卡设计/关卡  153 子节点 · 124 连线 · 链 38 · 未连线 6
N<code>=节点句柄（可直接传给写工具） · +K = 有 K 个子视图 · @x,y = 整数左上角
边段：--C<n> 文字 | 样式-->（按位置读；C 编号 = 该连线在父连线表中的序号）

CHAINS
[NRUo A 树屋遗址 | 主线节点 | 简单 | @0,260]--C3 起点-->[N6DX B 林缘草坡 | @220,260]--C7-->[NKBy C 古树枢纽 | Yellow | 简单 | @440,380]
[C 古树枢纽]--C11-->[D 林下低道 | @660,380]--C12-->[E 溪流洼地 | @880,380]
[E 溪流洼地]--C15-->[F 花草地 | @1100,380]--C16-->[G 根须廊 | @1320,380]
[G 根须廊]--C20-->[C 古树枢纽]            ← 回边自成一链；与上三条拼出环 C-D-E-F-G-C
UNLINKED
[PQ12 图例 (+7行) | 注释 | 简单 | @0,0]
STYLE  Default=#7d7d7d | Blue=#3b82f6 | …（节点预设全量）
LINK   Default=solid#6b7280 单向 | Red Dashed=dashed#ef4444 单向 | Green Plain=solid#22c55e 双向 | …（连线预设全量）
TAGS   主线 | 注释
```

要点：

- **链式呈现**：连线以"链"编排（两遍起点 + 未消费出边 + 分支点断链），链长降序排序；**环不内联标记**——需跨链交叉比对（共享首尾 cell）。
- **节点 cell**：首次出现全量 `[N句柄 名 (+K) | 标签 | 样式 | @x,y]`（槽位按省略条件收敛），再次出现短式 `[名]`（D0-a）。
- **边段槽位固定**：`--C<n> 文字 | 样式-->` 按位置读，无需逃逸表；连线样式恰为内置默认（`solid/2px/#6b7280/有向`）时省略样式槽；未命中预设回退紧凑原始值（如 `dashed#ef4444`）；`directed=false` 渲染 `--`。
- **句柄**：`N<code>` = 节点 id 的全局唯一最短前缀（≥3 位）；**写侧优先用句柄**。`C<n>` = 该连线在父连线表中的 1-based 下标（删除前序连线后会重排，需重读；`Nfrom>Nto` 寻址不受影响）。
- **无向边**按存储 `from→to` 遍历（`--` 只影响显示）。
- `STYLE`/`LINK` 给全量预设名 → 模型可按名写入（T5 `borderColor`、T12/T14 `preset`）；`TAGS` 给全量标签名。
- 153 节点 / 124 连线的真实规模视图输出 ≤ 8,000 字符 / ≤ 120 行（回归测试锁定）。

#### T3 `aidea_node_get`（读）—— 节点详情（详情层）

入参：`{ nodeId }`（句柄 / 名字 / 完整 id）。

返回：`{ node: {id, handle, displayName, parentId, x, y, width, height（均取整）, text, borderColor, tagIds[]}, parentId, pathToRoot: [首行...], children: [快照（含 handle/displayName，x/y 取整）], connections: [快照（含 directed/lineStyle/strokeWidth/strokeColor）], tagIds, referenceName }`（`referenceName` 为 `#引用名`，无则 null）。唯二保留几何信息的地方（cell 坐标已取整，outline 不含坐标）。

#### T4 `aidea_node_search`（读）—— 搜索节点

入参：`{ query, scope?: 'all'|'text'|'tag'|'reference', limit?: 50 (≤200) }`。

返回：`{ matches: [{ nodeId, firstLine, path, matched }], total }`（`path` 为祖先链，`matched` 为命中片段：文本行 / 标签名 / `#引用名`）。大小写不敏感子串匹配。

### 3.2 写（T5–T18，全部可撤销）

> 一次工具调用 = 一条历史（`aidea_batch` 整批一条）。文本用 `\n` 换行；节点文本以 `#` 开头会定义引用名（重名冲突见 T6）。
>
> **引用解析**：所有 `nodeId` / `parentId` / `nodeIds` 类入参统一走五级解析——完整 id 精确 → `N` 句柄（≥3 位前缀，唯一才接受）→ 唯一显示名精确（含 `(2)`/`(3)` 同名后缀）→ 唯一子串匹配 → 失败抛 ToolError 并附 ≤5 个候选（带句柄）。**句柄语法优先**：形如 `N<code>` 的入参只按句柄解析、不回退名字。解析失败只在入口报错，不"猜"，避免误写。

#### T5 `aidea_node_create`（写）—— 批量创建节点

| 参数 | 说明 |
|---|---|
| `parentId` | 目标父节点（句柄 / 名字 / id；其视图内创建） |
| `texts` | string[]，1–200 项，每项一个节点（支持多行） |
| `layout` | `auto`（默认：现有子节点包围盒下方一行）· `grid`（⌈√n⌉ 列网格）· `row`（单行） |
| `gap` | number，默认 24（px 间距） |
| `startAt` | `{x,y}`，显式左上角起点（覆盖 auto 基准） |
| `borderColor` | hex **或节点预设名**（如 `"Blue"`），可选（缺省取当前节点预设） |
| `preset` | 节点预设名（`borderColor` 的别名；两者同给时 `borderColor` 优先） |

返回：`{ createdIds: string[], undoHint }`。

#### T6 `aidea_node_set_text`（写）—— 批量改文本

入参：`{ updates: [{nodeId, text}] }`（1–200 项；`nodeId` 走引用解析）。两类失败**不中断**、逐项记入 `conflicts`：引用解析失败（`node ref not found`）与引用名重名冲突；其余项正常应用。

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

入参：`{ parentId, fromNodeId, toNodeId, preset?, lineStyle?: 'solid'|'dashed'|'dotted', strokeColor?, directed?, text? }`。两端必须是 `parentId` 的**直接子节点**（连线表示同级关系）；端点走引用解析。`preset` 为**连线预设名**（如 `"Red Dashed"`，展开为 lineStyle/strokeWidth/strokeColor/directed），显式样式字段覆盖预设。

返回：`{ connectionId, undoHint }`。

#### T13 `aidea_connection_remove`（破坏性）—— 删除连线

入参：`{ connectionIds: string[] }`（跨父级自动定位）。每项连线引用接受三种寻址：`C<n>`（**当前视图**连线表 1-based 下标）、`Nfrom>Nto`（两端句柄/名字，接受双向写法）、完整 connection id。返回：`{ removed, connectionIds, undoHint }`。

#### T14 `aidea_connection_update`（写）—— 批量改连线

入参：`{ connectionIds（寻址同 T13）, patch: { preset?, lineStyle?, strokeWidth? (1–10), strokeColor?, directed?, text? (string|null，null 清空文字) } }`。`patch.preset` 为连线预设名，显式字段覆盖。

返回：`{ updated, connectionIds, undoHint }`。

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

入参：`{ mode?: 'viewport'(默认)|'board', worldRect?: { x, y, width, height }, maxWidth?: 1024 (200–4000) }`。默认 1024（对齐"图会留在上下文里，小图快查"）。

返回 `content: [{ type: 'image', data: <base64 PNG>, mimeType: 'image/png' }]`。输出宽度按 `maxWidth` 归一（总像素上限约 16M、画布单边 16384 自动降采样）。

- `viewport`：当前可见视口（默认）；窗口最小化/隐藏时画布无尺寸会报错（见 §7）。
- `board`：当前视图全部节点的包围盒（`childrenOf(currentNodeId)`），世界→屏幕换算后裁剪，**不受视口平移/缩放影响**；视图为空报错。
- `worldRect`：指定区域截图（当前视图世界坐标，宽高 > 0），给出时优先于 `mode`。

调试客户端对应命令：`npm run mcp:cli -- shot [--board] [--rect x,y,w,h] [--max-width n] [--out <png>]`。

#### T21 `aidea_windows_list`（读）—— 窗口清单

入参：无。main 本地应答。返回：`{ windows: [{ windowId, focused, projectName, dirty, toolReady }] }`。

---

## 4. Resources（3 个）

| URI | mime | 内容 |
|---|---|---|
| `aidea://project/current` | `application/json` | 当前项目序列化（与保存的 `.aidea.json` 同构） |
| `aidea://view/current` | `text/markdown` | 当前主视图的**链式文本**（同 T2 默认参数的 text 输出） |
| `aidea://board/tags` | `application/json` | 标签字典（同 T19，便于客户端缓存） |

同步按需生成（读取时 renderer 执行），无订阅/推送。

---

## 5. 常见任务手册（写给 Agent）

**建立心智模型**（三层读模型，推荐调用序列）：`board_overview` → `outline{depth:3}`（~50 行，决定要读哪个子视图）→ 需要时 `outline{rootId}` 下钻 → `view_read{nodeId}`（读该视图的链 + 字典）→ 单节点细节用 `node_get` → 写工具（用句柄/名字）。

**定位内容**：大板用 `view_read{filter}` 只看命中链（±1 跳）；全文搜索用 `node_search`；超过 `maxChains` 时按 `nextAfter` 翻页（`after` 参数）。

**批量建一张子图**：`node_create{parentId, texts:[...]}` → 记下 `createdIds`（或读 outline 拿句柄）→ `connection_add`（可用 `preset:"捷径"`）→ `tag_apply` 打标 → `screenshot` 自检。一步到位可用 `batch` 把后三步打包成原子操作。

**修改既有内容**：`outline` / `view_read` 拿句柄 → `node_set_text`（注意 `conflicts` 返回；解析失败会附候选，改用候选里的句柄）→ `node_move` / `node_arrange` 调整布局。

**改连线**：`view_read` 里每条边带 `C<n>`；删除/修改用 `C<n>` 或 `Nfrom>Nto`。**删除连线后 `C<n>` 会重排**——先重读再寻址（`Nfrom>Nto` 不受影响）。

**跨视图操作**：cell 里的 `(+K)` 标记表示该节点有 K 个子视图——用 `view_read{nodeId}` 读该子视图或 `node_get` 拿 `children`；迁移用 `node_reparent`。

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

> 联调推荐先用仓库自带的调试客户端 `tools/mcp-cli.mjs` 自检（零依赖，自动读取 mcp.json 的端口与 token）：`npm run mcp:cli -- ping`。支持 `tools` / `call <tool> [json|@file]` / `outline [rootId] [depth]` / `shot` / `repl`（交互模式）/ `demo`（模拟一次 Agent 小流程）；大响应（>2k 字符）默认截断展示，加 `--full` 看全文。详见 `node tools/mcp-cli.mjs help`。

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
  registry.ts  工具登记表（22 工具 + 3 resource，单一数据源）
  host.ts      installMcpHost()：请求处理 / 清单发布 / 窗口态上报 / 调用日志 / undoHint
  schema.ts    最小 JSON Schema 校验器（零依赖）
  naming.ts        读侧命名纯函数：句柄分配 / 同名消歧 / 颜色归一化 / 预设名匹配
  chainText.ts     链分解（两遍起点 + 未消费出边 + 分支点断链）与链式视图文本
  outlineText.ts   索引层大纲文本
  viewText.ts  MCP 专用视图转文本（直线命中；view_read includeLayout 可选段用）
  tools/*      分域 handler：写路径全部经 useCommands（可撤销）；引用解析在 tools/shared.ts
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
| `src/mcp/{naming,chainText,outlineText}.ts` | 读侧纯函数：命名/句柄、链式文本、大纲文本（零 store 依赖，单测直测） |
| `src/mcp/tools/{board,node,connection,misc}.ts` | 分域 handler（引用解析与预设名解析在 `tools/shared.ts`） |
| `src/components/settings/McpSection.vue` | 设置分区 |
| `tools/mcp-cli.mjs` | 调试客户端（模拟 Agent 调用，零依赖；`npm run mcp:cli`） |
| 测试 | `src/mcp/__tests__/` · `electron/main/mcp/__tests__/` |

---

## 9. 设计决策要点

- **精选 22 个意图级工具**而非 1:1 暴露适配层（11 域 ~136 方法）：模型语用契约 ≠ 插件 SDK 契约，且工具清单直接吃上下文窗口。
- **读侧三层模型（读接口改版）**：索引层 outline / 内容层 view_read（链式文本）/ 详情层 node_get，把"要不要展开"从一次大读变成一串小读。旧版 lineHit 全量输出（153 节点实测 53,441 字符 / 2,549 行）被链式文本取代（同规模 ≤ 8,000 字符 / ≤ 120 行）；`lineHitRows` 降级为 `includeLayout` 可选段，与插件对照测试保留。
- **读与写共用同一套词汇**（G4）：节点 = 全局唯一最短前缀句柄 `N<code>` 或唯一显示名；连线 = `C<n>`（父连线表 1-based 下标）或 `Nfrom>Nto`；样式走预设名（正反向匹配 + 归一化 hex）。读输出的名字/句柄可直接传给写工具，消除"能读不能写"。
- **序列化层取整，不动存储**：`x/y` 保持 float（Konva 拖拽产生浮点），只在 MCP 输出取整——避免拖动抖动、undo 快照不等与既有项目迁移。
- **`src/mcp/viewText.ts` 与 `plugins/ai/utils/viewText.ts` 是有意隔离的两份实现**：消费者/边界/演进节奏不同（面板可调参可试验、MCP 契约求稳）。对照测试 `src/mcp/__tests__/viewText.test.ts` 锁定同一节点集的行分组一致，插件版行为分叉会立刻报红。生产代码（`src/**` 非 `__tests__`）禁止 import `plugins/`。链式文本的三个模块（`naming/chainText/outlineText.ts`）同为零 store 依赖纯函数，单测直测。
- **MCP 不是插件**，不占用插件扩展点（未来如开放，必须「内核不变 + `ctx.register.registerMcpTool` 只增」，清单变化走 `publishTools()` 重推）。
- 与内置 `plugins/ai` 互补：`ai` = AIDEA 调外部模型；MCP = 外部 Agent 驱动 AIDEA。二期可让 `ai` 插件复用 `src/mcp/registry.ts` 的工具定义。

---

## 10. 读侧已知缺陷（三层读模型，均已评估接受）

1. **`-->` 与节点名冲突**：节点名/连线文字含 `→` 或 `-->` 时会污染边段渲染（实测命中极低，零逃逸表换取格式简单）。
2. **`|` 破坏槽位解析**：节点名或连线文字含 `|` 时 cell/边段槽位可能错位（同理接受）。
3. **环需跨链比对**：闭环标记 `↩回[X]` 仅在"链走回当前链内已有节点"时出现；多数环表现为多条链共享首尾节点，模型需交叉比对（实测闭环标记触发率极低）。
4. **`C<n>` 删除重排**：删除前序连线后，后续连线编号前移——契约是"删除连线后重新读取再按 C 寻址"；`Nfrom>Nto` 与完整 id 不受影响。
5. **无向边遍历方向固定**：`directed=false` 仍按存储 `from→to` 分解与遍历，可能与人类视觉意图相反（`--` 只影响显示）。
6. **additions 只给键名**：插件扩展数据属插件私有命名空间（`pluginId:key`），值形状未知，outline 的 `includeAdditions` 只列键名。
7. **句柄前缀可能随新增节点加长**：句柄是"读取时全局集合"的最短唯一前缀，新节点前缀冲突会使既有句柄变长；解析要求"解析时唯一"，歧义即报候选——读出的句柄建议及时使用。
