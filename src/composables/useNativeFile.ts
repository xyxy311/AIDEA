/**
 * useNativeFile —— 项目文件桥的唯一 renderer 访问点（架构红线）。
 * Electron 桌面形态下 preload 注入的 window.aideaFile 恒存在且先于应用脚本执行，
 * 故模块加载时读取一次。renderer 不得直接访问该桥，路径/磁盘读写一律由 main 进程完成。
 */
import type { FileBridge } from '../../electron/shared/bridge'

// 全 renderer 唯一项目文件桥访问点：模块加载时读取一次
export const nativeFile: FileBridge = window.aideaFile