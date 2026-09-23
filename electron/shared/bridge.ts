/**
 * bridge.ts —— Electron 壳层（main/preload）与 renderer 的 IPC 契约全量。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §3 / §10。
 * 架构红线（违反即回不去，任何改动须评审）：
 * - IPC 通道白名单 = 本文件的 IPC 常量（含窗口控制通道 WINDOW_*，新增通道必须在本文件集中评审）。
 * - preload 永不暴露 fs/path/shell/dialog 或任何携带任意路径参数的通道。
 * - renderer 侧只允许 `src/plugin/sources/desktop.ts` import 本文件（type-only）。
 *   例外说明：aideaWindow 的类型声明也定义在本文件（Window 接口），但窗口控制桥的全
 *   renderer 唯一运行时访问点为 src/composables/useWindowControls.ts——该文件不 import
 *   本文件，用局部形状断言保持与 WindowBridge 一致，故上述红线不变。
 * - main 进程也会 import 本文件（bridge 契约双向共享），因此除类型与常量外不得含任何运行时副作用。
 */

/** IPC 通道名白名单 */
export const IPC = {
  /** renderer → main：扫描插件目录（invoke），返回 DesktopPluginInfo[] */
  LIST: 'plugins:list',
  /** main → renderer：插件目录内容变更（M2 watch 接入；M1 main 不发送，preload 完整实现订阅转发） */
  CHANGED: 'plugins:changed',
  /** renderer → main：最小化窗口（send，fire-and-forget） */
  WINDOW_MINIMIZE: 'window:minimize',
  /** renderer → main：切换最大化/还原（send，fire-and-forget） */
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  /**
   * renderer → main：关闭窗口（send，fire-and-forget）。
   * 语义 = renderer 已完成未保存改动确认（应用内 projectFile.confirmDiscard）后的强制关闭：
   * main 侧用 win.destroy() 直接销毁，绕过 renderer beforeunload 防线（避免二次拦截）。
   */
  WINDOW_CLOSE: 'window:close',
  /** renderer → main：查询当前是否最大化（invoke），返回 boolean */
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  /** main → renderer：最大化状态变更推送，载荷 boolean（最大化/进入全屏 = true） */
  WINDOW_MAXIMIZED_CHANGED: 'window:maximized-changed',
  /** renderer → main：打开项目文件（dialog + readFile），invoke */
  FILE_OPEN: 'file:open',
  /** renderer → main：另存项目（dialog + writeFile），invoke；载荷 { defaultName, content } */
  FILE_SAVE: 'file:save',
  /** renderer → main：覆盖写入已记忆路径（Ctrl+S 覆盖 / 重写），invoke；载荷 { path, content } */
  FILE_WRITE: 'file:write',
  /** renderer → main：读取已记忆路径内容（打开最近文件、重读），invoke；载荷 { path } */
  FILE_READ: 'file:read',
} as const

/**
 * 插件清单的 JSON 形状。
 * 与 src/types/plugin.ts 的 PluginManifest 同构；main 进程不 import src/，故在此独立声明，
 * 两侧形状一致性由测试与评审保证（插件分发契约 v1：docs/Electron桌面化实施蓝图.md §6）。
 */
export interface PluginManifestJSON {
  /** 命名空间 id（与 manifest 内联 id 一致；装载时 PluginManager 校验目录名 ↔ 内联 id 匹配） */
  id: string
  name: string
  version: string
  description?: string
  author?: string
  /** 本插件声明的适配层版本，须与宿主 SDK_VERSION 匹配，否则禁用 */
  sdkVersion: string
}

/**
 * main 扫描产出的单个本地插件描述（零代码执行：只读目录名 / manifest.json / 入口文件存在性）。
 */
export interface DesktopPluginInfo {
  /** 插件目录名（强校验 ^[a-z0-9_-]+$，同时是协议 URL aidea-plugin://<id>/ 的 host） */
  id: string
  /** 入口文件名（相对插件目录，如 'plugin.js'；main 按优先级判定） */
  entry: string
  /** 外置清单；null = 未提供 manifest.json，装载时由插件内联 manifest 兜底 */
  manifest: PluginManifestJSON | null
  /** 结构非法等原因说明（UI 可展示；有 error 的条目装载层跳过） */
  error?: string
}

/**
 * preload 经 contextBridge 暴露到 renderer 的桌面桥（window.aideaDesktop）。
 * 本项目为纯 Electron 桌面形态，桥恒存在；sources/desktop.ts 是唯一访问点。
 */
export interface DesktopBridge {
  /** 形态标记（调试/分叉排查用；插件禁探测，见蓝图红线 5） */
  readonly kind: 'desktop'
  /** 列出本地插件目录中的插件（无参数——目录由 main 决定，renderer 永远不给路径） */
  listPlugins(): Promise<DesktopPluginInfo[]>
  /** 订阅插件目录变更（携带变更插件 id 列表）；返回取消订阅函数 */
  onPluginsChanged(cb: (ids: string[]) => void): () => void
}

/**
 * preload 经 contextBridge 暴露到 renderer 的窗口 chrome 桥（window.aideaWindow）。
 * 与插件桥 DesktopBridge 职责分离：DesktopBridge 服务插件系统（扫描/订阅插件目录），
 * WindowBridge 只管窗口 chrome 控制（最小化/最大化/关闭/最大化状态推送）。
 * 本项目为纯 Electron 桌面形态，桥恒存在。
 */
export interface WindowBridge {
  /** 最小化窗口（fire-and-forget） */
  minimize(): void
  /** 切换最大化/还原（fire-and-forget） */
  toggleMaximize(): void
  /**
   * 关闭窗口（fire-and-forget）。调用前 renderer 须已完成未保存改动确认；
   * main 侧 destroy() 强制销毁，不再走 beforeunload（系统关闭路径 Alt+F4 等的
   * 兜底确认在 main 的 will-prevent-unload，不经过本通道）。
   */
  close(): void
  /** 查询当前是否最大化（含全屏；Aero Snap 半屏不算） */
  isMaximized(): Promise<boolean>
  /** 订阅最大化状态变更（true = 进入最大化/全屏）；返回取消订阅函数 */
  onMaximizedChange(cb: (maximized: boolean) => void): () => void
}

/**
 * preload 经 contextBridge 暴露到 renderer 的项目桥（window.aideaFile）。
 * 负责项目文件的新建/保存/打开的磁盘 IO——文件位置与读写一律由 main 进程
 * （dialog + fs）完成，renderer 不接触文件系统：
 * - 打开/另存：main 用原生对话框让用户选路径，renderer 不传路径；
 * - 覆盖保存 / 打开最近文件：renderer 回传「之前由对话框产生的路径」（其自身
 *   持久化的最近列表），main 仅对其做磁盘读写（该路径即应用自己的项目数据）。
 * 纯桌面形态恒存在。
 */
export interface FileBridge {
  /** 打开项目（showOpenDialog + readFile）；取消返回 { canceled: true } */
  openProject(): Promise<OpenFileResult>
  /** 另存项目（showSaveDialog + writeFile）；取消返回 { canceled: true } */
  saveProject(opts: { defaultName: string; content: string }): Promise<SaveFileResult>
  /** 覆盖写入已记忆路径（Ctrl+S 覆盖保存） */
  writeFile(opts: { path: string; content: string }): Promise<void>
  /** 读取已记忆路径内容（打开最近文件 / 重读） */
  readFile(opts: { path: string }): Promise<{ content: string }>
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

declare global {
  interface Window {
    /** 纯桌面形态恒存在。全 renderer 仅 src/plugin/sources/desktop.ts 允许访问（架构红线） */
    aideaDesktop: DesktopBridge
    /**
     * 纯桌面形态恒存在。窗口控制桥的全 renderer 唯一运行时访问点为
     * src/composables/useWindowControls.ts——该文件不 import 本文件（红线：renderer 只允许
     * desktop.ts import），用局部形状断言保持与 WindowBridge 一致。
     */
    aideaWindow: WindowBridge
    /**
     * 纯桌面形态恒存在。项目文件桥的全 renderer 唯一运行时访问点为
     * src/composables/useNativeFile.ts——该文件 type-only import 本文件（与 desktop.ts
     * 同一红线模式：bridge 契约文件与 renderer 访问面分离）。
     */
    aideaFile: FileBridge
  }
}
