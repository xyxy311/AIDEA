/**
 * protocol.ts —— 自定义协议注册（aidea-plugin:// 插件资源 + app:// renderer 载体）。
 * 共同规则：仅 GET 其余 405；物理路径解析一律经 fsGuard.resolveSafeFile（traversal 防护：../、URL 编码、绝对路径注入、前缀相似目录），失败统一 403 不回内省信息；
 * 响应 Cache-Control: no-store + ETag(mtime)，If-None-Match 命中回 304；MIME 由 mime.pickMimeType 提供。
 * aidea-plugin://<pluginId>/<相对路径>：host=pluginId，须在扫描白名单 Map 内否则 403；app://./index.html 映射 dist/ 根路径默认文档 index.html（刻意不用 file://，避免 origin 为 null）。
 */
import { app, protocol } from 'electron'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { decodeProtocolPath, resolveSafeFile } from './fsGuard'
import { pickMimeType } from './mime'
import { getPluginDir } from './plugins'

/**
 * 跨 origin 模块加载 CORS 放行 *：ES module 动态 import 是 CORS 模式请求，响应必须带 Access-Control-Allow-Origin 才能被 renderer 装载。
 * 协议访问面已有插件白名单守卫且渲染源恒为本应用，不存在第三方 origin 可达此 handler；统一放行 * 让 renderer 看到真实状态码。
 */
const CORS_HEADERS: Record<string, string> = { 'Access-Control-Allow-Origin': '*' }

/** privileged schemes：必须在 app ready 前调用（index.ts 顶层） */
export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'aidea-plugin',
      privileges: {
        standard: true, // 相对路径按 URL 标准解析的前提
        secure: true,
        supportFetchAPI: true, // renderer 动态 import()/fetch 的前提
        stream: true,
        corsEnabled: true, // 跨 origin module import 的前提
      },
    },
    {
      scheme: 'app',
      // 与 aidea-plugin 同款 privileges，保证 renderer 内跨 origin module import 行为一致
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ])
}

/** URL 守卫结果：pass = 已解析出的安全物理路径；fail = 直接以此状态码响应 */
type GuardResult = { pass: true; filePath: string } | { pass: false; status: number }

/** 空响应（无 body，只带状态码；不回内省信息；统一携带 CORS 头） */
function emptyResponse(status: number, extraHeaders?: HeadersInit): Response {
  return new Response(null, { status, headers: { ...CORS_HEADERS, ...extraHeaders } })
}

/**
 * 通用文件服务：stat → 304/200。不区分业务协议（守卫已在 guard 中完成）。
 */
async function serveFile(filePath: string, request: Request): Promise<Response> {
  let stat
  try {
    stat = await fsp.stat(filePath)
  } catch {
    return emptyResponse(404)
  }
  // 只服务普通文件；目录请求（尾斜杠等）按 404 处理
  if (!stat.isFile()) return emptyResponse(404)

  // ETag 取自 mtime（本地磁盘读无成本，no-store + ETag 是避免缓存一致性坑的取舍）
  const etag = `"${stat.mtimeMs}"`
  if (request.headers.get('if-none-match') === etag) {
    return emptyResponse(304, { ETag: etag, 'Cache-Control': 'no-store' })
  }

  let data: Buffer
  try {
    data = await fsp.readFile(filePath)
  } catch {
    return emptyResponse(404)
  }
  // Buffer → Uint8Array：对齐 Response BodyInit 的 ArrayBufferView 类型
  const body = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': pickMimeType(filePath),
      'Cache-Control': 'no-store',
      ETag: etag,
      ...CORS_HEADERS,
    },
  })
}

/** 生成"守卫 + 文件服务"的标准协议 handler */
function createFileProtocolHandler(guard: (url: URL) => GuardResult): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    // 仅 GET：资源读取语义，其余一律 405
    if (request.method !== 'GET') return emptyResponse(405)

    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return emptyResponse(403)
    }
    const result = guard(url)
    if (!result.pass) return emptyResponse(result.status)
    return serveFile(result.filePath, request)
  }
}

/** 统一把"URL pathname → 解码后的相对路径"，失败返回 null（调用方按 403 处理） */
function decodeUrlPathname(url: URL): string | null {
  return decodeProtocolPath(url.pathname)
}

/**
 * 剥离 URL 结构性的那一个开头斜杠（pathname 必以 / 开头）。
 * 只剥一个：解码产生的多余开头斜杠（如 %2f%2f → //）保留原样，交给 resolveSafeFile 判 escape。
 */
function stripStructuralSlash(decoded: string): string {
  return decoded.replace(/^\//, '')
}

/**
 * aidea-plugin:// 守卫：host=pluginId（小写化兜底），须在白名单否则 403——杜绝任意目录读；
 * 相对路径经 traversal 防护解析到插件目录内（空路径无默认文档语义，一律 403）。
 */
function guardPluginUrl(url: URL): GuardResult {
  const pluginId = url.host.toLowerCase()
  const dir = getPluginDir(pluginId)
  if (!dir) return { pass: false, status: 403 }

  const decoded = decodeUrlPathname(url)
  if (decoded === null) return { pass: false, status: 403 }
  const rel = stripStructuralSlash(decoded)
  if (!rel) return { pass: false, status: 403 }
  const resolved = resolveSafeFile(dir, rel)
  return resolved.ok ? { pass: true, filePath: resolved.filePath } : { pass: false, status: 403 }
}

/** renderer 产物目录（vite build 输出；dev 下 electron 走 VITE_DEV_SERVER_URL，不会用到） */
function rendererDistRoot(): string {
  return path.join(app.getAppPath(), 'dist')
}

/** app:// 守卫：host 忽略（standard scheme 要求有 host，约定写 '.'）；根路径默认文档 index.html（SPA 无路由）。 */
function guardAppUrl(url: URL): GuardResult {
  const decoded = decodeUrlPathname(url)
  if (decoded === null) return { pass: false, status: 403 }
  // 剥一个结构性斜杠后为空 → 根路径 → 默认文档
  const rel = stripStructuralSlash(decoded) || 'index.html'
  const resolved = resolveSafeFile(rendererDistRoot(), rel)
  return resolved.ok ? { pass: true, filePath: resolved.filePath } : { pass: false, status: 403 }
}

/** app ready 后调用：注册两个协议的 handler（资源读取在此时才开始发生） */
export function registerProtocolHandlers(): void {
  protocol.handle('aidea-plugin', createFileProtocolHandler(guardPluginUrl))
  protocol.handle('app', createFileProtocolHandler(guardAppUrl))
}
