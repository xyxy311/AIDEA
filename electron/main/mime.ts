/**
 * mime.ts —— 自定义协议（aidea-plugin:// 与 app://）响应的 MIME 推断（纯函数，可独立单测）。
 * 硬要求：.js/.mjs 必须返回 text/javascript——ESM 对 MIME 严格校验，否则动态 import() 会失败。
 * 两协议共用一张表（app:// 额外需要 .html 服务 index.html）。
 */
import path from 'node:path'

/** 扩展名 → MIME 映射（键为小写扩展名，含点） */
const MIME_BY_EXT: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
}

/** 未识别扩展名的兜底类型（二进制流，浏览器按 attachment/二进制处理，不会误判为脚本） */
export const DEFAULT_MIME = 'application/octet-stream'

/** 按文件路径的扩展名推断 MIME（大小写不敏感；未识别返回 application/octet-stream） */
export function pickMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (!ext) return DEFAULT_MIME
  return MIME_BY_EXT[ext] ?? DEFAULT_MIME
}
