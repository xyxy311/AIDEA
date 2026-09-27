/**
 * i18n.ts —— main 进程的运行时 i18n 目录壳（electron 依赖只在本文件；纯逻辑在 i18nScan.ts）。
 * 根：dev 为 <仓库根>/i18n-runtime/，打包后为 userData/i18n/；白名单由 rescanI18n() 全量刷新，
 * 仅白名单内 id 允许读取（I18N_READ），杜绝任意文件读。
 */
import { app } from 'electron'
import path from 'node:path'
import type { I18nFileInfo } from '../shared/bridge'
import { scanI18nFiles } from './i18nScan'

/** dev 运行时 i18n 目录名（位于仓库根） */
const DEV_I18N_DIR = 'i18n-runtime'

/** 打包后运行时 i18n 目录名（位于 userData） */
const PROD_I18N_DIR = 'i18n'

/** 当前运行时 i18n 根绝对路径（按运行形态决定） */
export function i18nRoot(): string {
  return app.isPackaged
    ? path.join(app.getPath('userData'), PROD_I18N_DIR)
    : path.join(app.getAppPath(), DEV_I18N_DIR)
}

/** 白名单 Map：id → 语言文件绝对路径；由 rescanI18n() 全量刷新 */
let fileWhitelist = new Map<string, string>()

/** I18N_READ 专用：查询语言 id 的授权文件；不在白名单返回 null（调用方拒绝） */
export function getI18nFile(id: string): string | null {
  return fileWhitelist.get(id) ?? null
}

/** 重扫运行时 i18n 目录并全量刷新白名单，返回 renderer 可见的条目列表（消失的语言自动失去授权）。 */
export function rescanI18n(): I18nFileInfo[] {
  const { infos, files } = scanI18nFiles(i18nRoot())
  fileWhitelist = files
  return infos
}