/**
 * useNativeFile —— 项目文件桥的唯一渲染进程访问点
 *
 * ⚠ 全 renderer 唯一的 `window.aideaFile` 桥访问点（架构红线，与
 * src/plugin/sources/desktop.ts 的 window.aideaDesktop 同一模式）：
 * - 项目已收敛为纯 Electron 桌面形态，preload 注入的项目文件桥（main 进程
 *   dialog + fs）恒存在；
 * - Electron preload 经 contextBridge 注入先于应用脚本执行，因此模块加载时
 *   读取一次即可。
 *
 * 除本文件外，renderer 任何代码不得访问 window.aideaFile。文件位置与磁盘读写
 * 一律由 main 进程完成；renderer 不传任意路径（仅回传自身持久化的最近/记忆路径）。
 * IPC 契约类型来自 electron/shared/bridge.ts（type-only import，契约文件冻结）。
 */
import type { FileBridge } from '../../electron/shared/bridge'

// 全 renderer 唯一项目文件桥访问点：模块加载时读取一次
export const nativeFile: FileBridge = window.aideaFile