/**
 * useNativeFs —— 通用任意文件桥（window.aideaFs）的唯一 renderer 访问点（架构红线）。
 * 与 useNativeFile 同构：Electron 桌面形态下 preload 注入的 window.aideaFs 恒存在且先于应用脚本执行，
 * 故模块加载时读取一次。renderer 不经此处不得直接访问该桥；磁盘读写一律由 main 进程完成。
 * 本原语是「原版应用内置功能」与插件 fs 域（api/fs.ts）共用的宿主底层。
 */
import type { FsBridge } from '../../electron/shared/bridge'

// 全 renderer 唯一通用文件桥访问点：模块加载时读取一次
export const nativeFs: FsBridge = window.aideaFs

/**
 * Uint8Array → 全新 ArrayBuffer（拷贝字节，不含对原缓冲区的引用）。
 */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

/** Uint8Array → 小写十六进制字符串（二进制格式手工解析时的便捷工具） */
export function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.byteLength; i++) out += bytes[i]!.toString(16).padStart(2, '0')
  return out
}

/** 面向宿主内置功能的访问入口（等价直接使用 nativeFs，语义上便于注入与测试） */
export function useNativeFs(): FsBridge {
  return nativeFs
}