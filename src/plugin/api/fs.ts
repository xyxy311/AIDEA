/**
 * api/fs.ts —— 文件系统域：任意文件的读写 I/O（open/save 对话框驱动，write/read 走已记忆路径令牌）。
 * 与 file 域的边界：file = 项目文件序列化/解析/项目状态只读；fs = 与文件夹无关的任意文件读写。
 * 全部方法异步委托通用文件桥（useNativeFs 的 nativeFs），main 进程负责 dialog + fs + iconv 编解码；
 * 插件持有的 path 只是「回传令牌」——再次读/覆盖写仍交给 main 落盘，而非插件自己读文件。
 */
import { nativeFs, toArrayBuffer, bytesToHex } from '@/composables/useNativeFs'
import type {
  FsOpenRequest,
  FsSaveRequest,
  FsReadRequest,
  FsWriteRequest,
  FsOpenResult,
  FsSaveResult,
  FsReadResult,
} from '../../../electron/shared/bridge'

export function createFsApi() {
  const api = {
    /** 打开一个文件并读取内容（对话框选路径）。mode='text' 返回 content（按 encoding 解码），binary 返回 bytes */
    open(req: FsOpenRequest): Promise<FsOpenResult> {
      return nativeFs.open(req)
    },
    /** 另存一个文件（对话框选路径）。mode='text' 按 encoding 编码写 content，binary 写 bytes；取消返回 { canceled: true } */
    save(req: FsSaveRequest): Promise<FsSaveResult> {
      return nativeFs.save(req)
    },
    /** 重读之前 open 返回的记忆路径令牌。mode='text' 返回 content，binary 返回 bytes */
    read(req: FsReadRequest): Promise<FsReadResult> {
      return nativeFs.read(req)
    },
    /** 覆盖写之前 open/save 返回的记忆路径令牌。mode='text' 按 encoding 编码写 content，binary 写 bytes */
    write(req: FsWriteRequest): Promise<void> {
      return nativeFs.write(req)
    },
    /** Uint8Array → ArrayBuffer（二进制格式解析原语） */
    toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
      return toArrayBuffer(bytes)
    },
    /** Uint8Array → 小写十六进制字符串（二进制格式手工解析原语） */
    bytesToHex(bytes: Uint8Array): string {
      return bytesToHex(bytes)
    },
  }
  return api
}

export type FsApi = ReturnType<typeof createFsApi>

// 契约类型 re-export（供插件按需 import，与 node/file 等域类型出口一致）
export type {
  FsMode,
  FsOpenRequest,
  FsSaveRequest,
  FsReadRequest,
  FsWriteRequest,
  FsOpenResult,
  FsSaveResult,
  FsReadResult,
  TextEncoding,
  FsFileFilter,
} from '../../../electron/shared/bridge'