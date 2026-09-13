/**
 * bridge.ts —— Electron 壳层（main/preload）与 renderer 的 IPC 契约全量。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §3 / §10。
 * 架构红线（违反即回不去，任何改动须评审）：
 * - IPC 通道白名单 = 本文件的 IPC 常量；新增通道必须在本文件集中评审。
 * - preload 永不暴露 fs/path/shell/dialog 或任何携带任意路径参数的通道。
 * - renderer 侧只允许 `src/plugin/sources/desktop.ts` import 本文件（type-only）。
 * - main 进程也会 import 本文件（bridge 契约双向共享），因此除类型与常量外不得含任何运行时副作用。
 */

/** IPC 通道名白名单 */
export const IPC = {
  /** renderer → main：扫描插件目录（invoke），返回 DesktopPluginInfo[] */
  LIST: 'plugins:list',
  /** main → renderer：插件目录内容变更（M2 watch 接入；M1 main 不发送，preload 完整实现订阅转发） */
  CHANGED: 'plugins:changed',
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
 * web 形态下 window.aideaDesktop === undefined，renderer 据此静默降级（sources/desktop.ts 唯一访问点）。
 */
export interface DesktopBridge {
  /** 形态标记（预留调试/分叉排查用；插件禁探测，见蓝图红线 5） */
  readonly kind: 'desktop'
  /** 列出本地插件目录中的插件（无参数——目录由 main 决定，renderer 永远不给路径） */
  listPlugins(): Promise<DesktopPluginInfo[]>
  /** 订阅插件目录变更（携带变更插件 id 列表）；返回取消订阅函数 */
  onPluginsChanged(cb: (ids: string[]) => void): () => void
}

declare global {
  interface Window {
    /** 仅桌面形态存在；web 为 undefined。全 renderer 仅 src/plugin/sources/desktop.ts 允许访问（蓝图红线 1） */
    aideaDesktop?: DesktopBridge
  }
}
