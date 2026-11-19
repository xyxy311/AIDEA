/**
 * bridge.ts —— Electron 壳层（main/preload）与 renderer 的 IPC 契约全量。
 * 红线：通道白名单集中于此；preload 永不暴露 fs/path 或携带路径参数的通道。
 */

/** IPC 通道名白名单 */
export const IPC = {
  /** renderer → main：扫描插件目录，返回 DesktopPluginInfo[] */
  LIST: 'plugins:list',
  /** main → renderer：插件目录变更推送（M1 main 不发送，preload 完整实现订阅转发） */
  CHANGED: 'plugins:changed',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  /**
   * 关闭窗口（send，fire-and-forget）：renderer 已完成未保存改动确认后，
   * main 用 destroy() 强制销毁，绕过 renderer beforeunload 防线。
   */
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_MAXIMIZED_CHANGED: 'window:maximized-changed',
  FILE_OPEN: 'file:open',
  FILE_SAVE: 'file:save',
  FILE_WRITE: 'file:write',
  FILE_READ: 'file:read',
  /**
   * renderer → main：登记当前窗口正在打开的项目路径（null = 未命名/新建）。
   * 用于多窗口场景下「同一项目已在其它窗口打开」的去重判定。
   */
  PROJECT_SET_PATH: 'project:set-path',
  /**
   * renderer → main：打开某项目前询问该路径是否已被其它窗口打开。
   * 是则 main 聚焦该窗口并返回 intercepted=true；renderer 据此拦截本次打开。
   */
  PROJECT_CLAIM: 'project:claim',
  /** renderer → main：任意文件读写（通用 fs 桥）。对话框驱动 + 已记忆路径回传令牌，text/binary 双编码 */
  FS_OPEN: 'fs:open',
  FS_SAVE: 'fs:save',
  FS_WRITE: 'fs:write',
  FS_READ: 'fs:read',
  /** renderer → main：列出运行时 i18n 目录内的语言文件清单，返回 I18nFileInfo[] */
  I18N_LIST: 'i18n:list',
  /** renderer → main：读取指定语言文件内容（only 白名单内 id，越界拒绝） */
  I18N_READ: 'i18n:read',
  /** main → renderer：运行时 i18n 目录变更推送（增/删/改对应语言 id 列表） */
  I18N_CHANGED: 'i18n:changed',

  // ── Agent MCP（第 6 座桥）──
  /** main → renderer：MCP 工具调用请求（requestId 关联回执） */
  MCP_REQUEST: 'mcp:request',
  /** renderer → main：工具调用回执（按 requestId 匹配 pending） */
  MCP_RESPONSE: 'mcp:response',
  /** renderer → main：工具/resource 清单缓存上报 */
  MCP_PUBLISH_TOOLS: 'mcp:publish-tools',
  /** main → renderer：服务器运行状态推送 */
  MCP_STATUS: 'mcp:status',
  /** renderer → main：读取当前运行状态快照（订阅前的初始状态） */
  MCP_STATUS_GET: 'mcp:status:get',
  /** renderer → main：本窗口业务态上报（windowId 由 main 盖章） */
  MCP_WINDOW_STATE: 'mcp:window-state',
  /** renderer → main：读取 MCP 配置 */
  MCP_CONFIG_GET: 'mcp:config:get',
  /** renderer → main：更新 MCP 配置（即时生效并推送新状态） */
  MCP_CONFIG_SET: 'mcp:config:set',
} as const

/**
 * 插件清单的 JSON 形状（与 src/types/plugin.ts 的 PluginManifest 同构；
 * main 不依赖 src/，故在此独立声明）。
 */
export interface PluginManifestJSON {
  /** 命名空间 id（装载时校验目录名 ↔ 内联 id 匹配） */
  id: string
  name: string
  version: string
  description?: string
  author?: string
  /** 本插件声明的适配层版本，须与宿主 SDK_VERSION 匹配，否则禁用 */
  sdkVersion: string
}

/** main 扫描产出的单个本地插件描述（零代码执行：只读目录名 / manifest / 入口存在性） */
export interface DesktopPluginInfo {
  /** 插件目录名（强校验 ^[a-z0-9_-]+$，同时是协议 URL aidea-plugin://<id>/ 的 host） */
  id: string
  entry: string
  /** 外置清单；null = 装载时由插件内联 manifest 兜底 */
  manifest: PluginManifestJSON | null
  /** 结构非法等原因说明；有 error 的条目装载层跳过 */
  error?: string
}

/** preload 经 contextBridge 暴露的桌面桥（window.aideaDesktop）；sources/desktop.ts 是唯一访问点 */
export interface DesktopBridge {
  readonly kind: 'desktop'
  /** 列出本地插件（目录由 main 决定，renderer 永不传路径） */
  listPlugins(): Promise<DesktopPluginInfo[]>
  /** 订阅插件目录变更（携带变更插件 id 列表）；返回取消订阅函数 */
  onPluginsChanged(cb: (ids: string[]) => void): () => void
}

/**
 * preload 暴露的窗口 chrome 桥（window.aideaWindow），与插件桥 DesktopBridge 职责分离，
 * 只管窗口控制（最小化/最大化/关闭/最大化状态推送）。
 */
export interface WindowBridge {
  minimize(): void
  toggleMaximize(): void
  /**
   * 关闭窗口（fire-and-forget）：renderer 已完成未保存改动确认；
   * main 侧 destroy() 强制销毁，不再走 beforeunload（系统关闭路径的兜底确认在 will-prevent-unload）。
   */
  close(): void
  /** 查询当前是否最大化（含全屏；Aero Snap 半屏不算） */
  isMaximized(): Promise<boolean>
  /** 订阅最大化状态变更（true = 进入最大化/全屏）；返回取消订阅函数 */
  onMaximizedChange(cb: (maximized: boolean) => void): () => void
}

/**
 * preload 暴露的项目文件桥（window.aideaFile）。文件位置与读写一律由 main（dialog + fs）
 * 完成，renderer 不接触文件系统；renderer 只回传之前由对话框产生的记忆路径。
 */
export interface FileBridge {
  openProject(): Promise<OpenFileResult>
  saveProject(opts: { defaultName: string; content: string }): Promise<SaveFileResult>
  /** 覆盖写入已记忆路径（Ctrl+S 覆盖保存） */
  writeFile(opts: { path: string; content: string }): Promise<void>
  readFile(opts: { path: string }): Promise<{ content: string }>
  /**
   * 登记当前窗口正在打开的项目路径（null = 未命名/新建）。
   * 打开/另存成功后调用使其进入「已打开」集合，供跨窗口去重。
   */
  setProjectPath(path: string | null): Promise<void>
  /**
   * 打开某项目前询问该路径是否已被其它窗口打开：是则 main 聚焦该窗口，
   * 返回 intercepted=true（调用方应拦截本次打开）；否则返回 false 可正常打开。
   */
  claimProject(path: string): Promise<ProjectClaimResult>
}

/** claimProject 的返回：intercepted=true 时主进程已聚焦目标窗口 */
export interface ProjectClaimResult {
  intercepted: boolean
  /** 目标窗口 id（intercepted=true 时存在） */
  windowId?: number
}

/** openProject 的返回：取消 / 成功（path + name + content） */
export interface OpenFileResult {
  canceled: boolean
  path?: string
  name?: string
  content?: string
}

/** saveProject 的返回：取消 / 成功（path + name） */
export interface SaveFileResult {
  canceled: boolean
  path?: string
  name?: string
}

/**
 * 通用任意文件读写契约（window.aideaFs / FsBridge）。
 * 安全模型与项目文件桥一致：open/save 一律由 main 弹对话框确定路径，renderer 永不传递路径；
 * write/read 的 path 只能回传 main 之前产出的「记忆路径令牌」，落盘/重读仍在 main 完成。
 * mode='text' 时按 encoding 用 iconv-lite 编解码（默认 utf-8）；mode='binary' 时载荷为 Uint8Array。
 */
export type FsMode = 'text' | 'binary'

/** 文本读取编码（iconv-lite 支持的常见编码；默认 utf-8；binary 模式忽略）。literal 给出常用项，也接受任意 iconv-lite 编码名 */
export type TextEncoding =
  | 'utf-8'
  | 'utf-16le'
  | 'latin1'
  | 'ascii'
  | 'gbk'
  | 'gb18030'
  | 'big5'
  | 'shift_jis'
  | 'shift-jis'
  | (string & {})

/** 对话框过滤规则（与 Electron.FileFilter 结构兼容，避免 renderer 侧引入 electron 类型） */
export interface FsFileFilter {
  name: string
  extensions: string[]
}

export interface FsOpenRequest {
  title?: string
  filters?: FsFileFilter[]
  /** 读取模式：text 按 encoding 解码返回 content；binary 返回 bytes（原样字节） */
  mode: FsMode
  /** 仅 text 生效，默认 'utf-8' */
  encoding?: TextEncoding
}

/** open 的返回：取消 / 成功（path + name + 按 mode 交付 text 或 binary 载荷） */
export interface FsOpenResult {
  canceled: boolean
  path?: string
  name?: string
  /** mode='text' 时返回（已按 encoding 解码） */
  content?: string
  /** mode='binary' 时返回（原始字节） */
  bytes?: Uint8Array
}

export interface FsSaveRequest {
  title?: string
  filters?: FsFileFilter[]
  defaultName?: string
  /** 写入模式：text 按 encoding 编码写 content；binary 写 bytes */
  mode: FsMode
  /** 仅 text 生效，默认 'utf-8' */
  encoding?: TextEncoding
  /** mode='text' 时的写入内容 */
  content?: string
  /** mode='binary' 时的写入内容 */
  bytes?: Uint8Array
}

/** save 的返回：取消 / 成功（path + name） */
export interface FsSaveResult {
  canceled: boolean
  path?: string
  name?: string
}

export interface FsReadRequest {
  /** 之前 open/save 返回的记忆路径令牌（renderer 不外传任意路径） */
  path: string
  mode: FsMode
  /** 仅 text 生效，默认 'utf-8' */
  encoding?: TextEncoding
}

export interface FsReadResult {
  path: string
  /** mode='text' 时返回 */
  content?: string
  /** mode='binary' 时返回 */
  bytes?: Uint8Array
}

export interface FsWriteRequest {
  /** 之前 open/save 返回的记忆路径令牌（覆盖写） */
  path: string
  mode: FsMode
  /** 仅 text 生效，默认 'utf-8' */
  encoding?: TextEncoding
  /** mode='text' 时的写入内容 */
  content?: string
  /** mode='binary' 时的写入内容 */
  bytes?: Uint8Array
}

/** preload 经 contextBridge 暴露的通用文件桥（window.aideaFs）；useNativeFs.ts 是唯一访问点 */
export interface FsBridge {
  open(req: FsOpenRequest): Promise<FsOpenResult>
  save(req: FsSaveRequest): Promise<FsSaveResult>
  read(req: FsReadRequest): Promise<FsReadResult>
  write(req: FsWriteRequest): Promise<void>
}

/** 运行时 i18n 目录扫描产出的单个语言条目（@meta 自描述：id/label/naiveBase） */
export interface I18nFileInfo {
  /** 语言 id（= 文件名去 .json，两者强校验一致） */
  id: string
  /** 语言自名（不可翻译文本，供下拉展示） */
  label: string
  /** naive-ui 文案兜底语言 id（App.vue 由此映射 NLocale） */
  naiveBase: string
}

/** preload 经 contextBridge 暴露的 i18n 桥（window.aideaI18n）；src/i18n/loader.ts 是唯一访问点 */
export interface I18nBridge {
  /** 列出运行时 i18n 目录内的语言清单（目录由 main 决定，renderer 永不传路径） */
  list(): Promise<I18nFileInfo[]>
  /** 读取指定 id 的语言文件内容；白名单外/非法 id 侧拒绝 */
  read(id: string): Promise<{ content: string }>
  /** 订阅运行时 i18n 目录变更（携带变更语言 id 列表）；返回取消订阅函数 */
  onChanged(cb: (ids: string[]) => void): () => void
}

// ── Agent MCP 接入（第 6 座桥 window.aideaMcp）──

/** MCP 护栏上限（userData/mcp.json 的 limits 段；语义见 docs/Agent-MCP接入.md） */
export interface McpLimitsConfig {
  /** aidea_batch 单次批内最大 op 数 */
  maxOpsPerBatch: number
  /** aidea_node_create 单次最多创建节点数 */
  maxNodesPerCreate: number
  /** aidea_node_delete 单次最多删除节点数（含子树展开） */
  maxDeletesPerCall: number
  /** 单次工具调用超时（ms，main 侧计时） */
  toolTimeoutMs: number
  /** 全局最大并发工具调用数 */
  maxConcurrent: number
  /** 每客户端滑动窗口（60s）内最大调用次数 */
  maxCallsPerMinute: number
}

/** MCP 配置（userData/mcp.json 的形状） */
export interface McpConfig {
  /** 总开关（默认关）：false 时不监听端口 */
  enabled: boolean
  /** 监听端口（仅 127.0.0.1；占用即报错不换端口） */
  port: number
  /** Bearer token（随机生成；设置面板可查看/复制/重置） */
  token: string
  limits: McpLimitsConfig
}

/** setConfig 的增量补丁；regenerateToken=true 时重新生成 token（忽略 token 字段） */
export interface McpConfigPatch {
  enabled?: boolean
  port?: number
  token?: string
  regenerateToken?: boolean
  limits?: Partial<McpLimitsConfig>
}

/** MCP 服务器运行状态（main 推送，设置面板展示） */
export interface McpStatus {
  /** 配置开关（≠ running） */
  enabled: boolean
  /** HTTP 服务器是否在监听 */
  running: boolean
  port: number
  /** 最近一次启动/运行错误（null = 正常） */
  error: string | null
}

/** renderer 上报的窗口业务态（windowId/focused 由 main 侧盖章） */
export interface McpWindowState {
  projectName: string
  dirty: boolean
  /** renderer host 已注册且清单已发布（未就绪窗口不接收路由） */
  toolReady: boolean
}

/** main 缓存的完整窗口态（aidea_windows_list 的条目） */
export interface McpWindowInfo extends McpWindowState {
  windowId: number
  focused: boolean
}

/** 工具清单条目（renderer 单一数据源 → main 缓存；tools/list 直接回包） */
export interface McpToolManifest {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
}

/** MCP resource 清单条目 */
export interface McpResourceManifest {
  uri: string
  name: string
  description: string
  mimeType: string
}

/** main → renderer 的工具调用请求 */
export interface McpToolRequest {
  requestId: string
  /** 工具名（resource 读取用内部伪工具 __resource__） */
  tool: string
  args: Record<string, unknown>
}

/** MCP content 项（tools/call 结果；工具同步返回，全部单 JSON） */
export type McpContentItem =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }

/** tools/call 的 MCP 结果形状 */
export interface McpToolCallResult {
  content: McpContentItem[]
  isError?: boolean
}

/** renderer → main 的工具回执 */
export interface McpToolResponse {
  requestId: string
  ok: boolean
  /** ok=true：最终 MCP 结果（host 已包装 content） */
  result?: McpToolCallResult
  /** ok=false：单行错误文本（main 包装为 isError:true） */
  error?: string
}

/**
 * preload 经 contextBridge 暴露的 MCP 桥（window.aideaMcp）。
 * 双向桥：main→renderer 请求（onRequest/respond），renderer→main 清单与窗口态上报；
 * 配置读写经 invoke，状态经 onStatus 推送。
 */
export interface McpBridge {
  /** 订阅工具调用请求（host 常驻一个订阅）；返回退订函数 */
  onRequest(cb: (req: McpToolRequest) => void): () => void
  /** 按 requestId 回执工具调用结果 */
  respond(res: McpToolResponse): void
  /** 发布工具/resource 清单缓存（host 启动时一次） */
  publishTools(tools: McpToolManifest[], resources: McpResourceManifest[]): void
  /** 订阅服务器状态推送；返回退订函数 */
  onStatus(cb: (status: McpStatus) => void): () => void
  /** 读取当前运行状态快照（订阅建立前已发生的状态变化不会补发，需先取一次） */
  getStatus(): Promise<McpStatus>
  /** 上报本窗口业务态（windowId 由 main 盖章） */
  reportWindowState(state: McpWindowState): void
  /** 读取 MCP 配置 */
  getConfig(): Promise<McpConfig>
  /** 更新 MCP 配置（即时生效；返回更新后的完整配置） */
  setConfig(patch: McpConfigPatch): Promise<McpConfig>
}

declare global {
  interface Window {
    /** 纯桌面形态恒存在；仅 sources/desktop.ts 允许访问（架构红线） */
    aideaDesktop: DesktopBridge
    /**
     * 纯桌面形态恒存在；全 renderer 唯一运行时访问点为 useWindowControls.ts
     * （局部形状断言保持与 WindowBridge 一致，不 import 本文件）。
     */
    aideaWindow: WindowBridge
    /** 纯桌面形态恒存在；全 renderer 唯一运行时访问点为 useNativeFile.ts */
    aideaFile: FileBridge
    /** 纯桌面形态恒存在；全 renderer 唯一访问点为 useNativeFs.ts */
    aideaFs: FsBridge
    /** 纯桌面形态恒存在；全 renderer 唯一访问点为 src/i18n/loader.ts */
    aideaI18n: I18nBridge
    /** 纯桌面形态恒存在；全 renderer 唯一运行时访问点为 src/mcp/host.ts */
    aideaMcp: McpBridge
  }
}
