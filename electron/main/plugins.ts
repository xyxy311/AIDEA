/**
 * plugins.ts —— main 进程的插件扫描壳（electron 依赖只在本文件；纯逻辑在 pluginScan.ts）。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §3 / §7。
 * - 插件根：dev 为 <仓库根>/plugins-local/（与内置 plugins/ 物理隔离，避免 glob 双收）；
 *   打包后为 userData/plugins/。
 * - 白名单 Map（id → 插件目录绝对路径）由 rescan() 全量刷新；协议 handler 经 getPluginDir()
 *   做访问控制——不在白名单中的 id 一律 403，杜绝任意目录读（蓝图红线 7）。
 * - M1 零代码执行：扫描只读目录名 / manifest.json / 入口存在性。
 */
import { app } from 'electron'
import path from 'node:path'
import type { DesktopPluginInfo } from '../shared/bridge'
import { scanPluginDirectories } from './pluginScan'

/** dev 插件根目录名（位于仓库根；已被 .gitignore 排除） */
const DEV_PLUGINS_DIR = 'plugins-local'

/** 打包后插件根目录名（位于 userData） */
const PROD_PLUGINS_DIR = 'plugins'

/** 当前插件根绝对路径（按运行形态决定） */
export function pluginsRoot(): string {
  return app.isPackaged
    ? path.join(app.getPath('userData'), PROD_PLUGINS_DIR)
    : path.join(app.getAppPath(), DEV_PLUGINS_DIR)
}

/** 白名单 Map：id → 插件目录绝对路径；由 rescan() 全量刷新 */
let dirWhitelist = new Map<string, string>()

/** 协议 handler 专用：查询插件 id 的授权目录；不在白名单返回 null（调用方按 403 处理） */
export function getPluginDir(id: string): string | null {
  return dirWhitelist.get(id) ?? null
}

/**
 * 重扫插件根并刷新白名单 Map，返回 renderer 可见的条目列表。
 * 全量替换语义：已从磁盘消失的插件自动失去协议授权。
 */
export function rescan(): DesktopPluginInfo[] {
  const { infos, dirs } = scanPluginDirectories(pluginsRoot())
  dirWhitelist = dirs
  return infos
}

/** 首次扫描入口（语义与 rescan 相同；保留独立命名以对齐蓝图 §3 的 API 表述） */
export function scanPluginsRoot(): DesktopPluginInfo[] {
  return rescan()
}
