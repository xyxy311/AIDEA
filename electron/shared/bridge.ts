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
  /** renderer → main：列出运行时 i18n 目录内的语言文件清单，返回 I18nFileInfo[] */
  I18N_LIST: 'i18n:list',
  /** renderer → main：读取指定语言文件内容（only 白名单内 id，越界拒绝） */
  I18N_READ: 'i18n:read',
  /** main → renderer：运行时 i18n 目录变更推送（增/删/改对应语言 id 列表） */
  I18N_CHANGED: 'i18n:changed',
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
    /** 纯桌面形态恒存在；全 renderer 唯一访问点为 src/i18n/loader.ts */
    aideaI18n: I18nBridge
  }
}
