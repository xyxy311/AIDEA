// @vitest-environment node
/**
 * fsGuard.test.ts —— fsGuard traversal 防护与目录名校验单测。
 * 被测模块为纯函数，node 环境直接运行、不触真实文件系统。
 */
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { decodeProtocolPath, isValidPluginDirName, resolveSafeFile } from '../fsGuard'

const ROOT = path.resolve('virtual-plugins-root')
const BASE = path.join(ROOT, 'plugin-a')

describe('isValidPluginDirName（目录名 = pluginId 强校验）', () => {
  it('合法：小写字母/数字/下划线/连字符', () => {
    expect(isValidPluginDirName('hello')).toBe(true)
    expect(isValidPluginDirName('a-b_c01')).toBe(true)
    expect(isValidPluginDirName('9')).toBe(true)
  })

  it('非法：大写 / 中文 / 空格 / 空 / 点号', () => {
    expect(isValidPluginDirName('Hello')).toBe(false) // 协议 host 会被小写化，大写目录名无法寻址
    expect(isValidPluginDirName('白板插件')).toBe(false)
    expect(isValidPluginDirName('has space')).toBe(false)
    expect(isValidPluginDirName('')).toBe(false)
    expect(isValidPluginDirName('..')).toBe(false)
    expect(isValidPluginDirName('a.b')).toBe(false)
  })
})

describe('decodeProtocolPath（URL pathname 解码）', () => {
  it('普通路径原样返回', () => {
    expect(decodeProtocolPath('/index.js')).toBe('/index.js')
  })

  it('百分号编码解码：%2e%2e%2f → ../（必须在安全校验前解码，否则编码 traversal 绕过字面检查）', () => {
    expect(decodeProtocolPath('%2e%2e%2fsecret.txt')).toBe('../secret.txt')
    expect(decodeProtocolPath('a%20b.txt')).toBe('a b.txt')
  })

  it('畸形编码返回 null（由调用方按 403 处理）', () => {
    expect(decodeProtocolPath('%zz')).toBeNull()
    expect(decodeProtocolPath('%2')).toBeNull()
  })
})

describe('resolveSafeFile —— traversal 防护', () => {
  it('合法相对路径：解析到基目录内', () => {
    const r = resolveSafeFile(BASE, 'index.js')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.filePath).toBe(path.join(BASE, 'index.js'))

    const sub = resolveSafeFile(BASE, 'assets/logo.svg')
    expect(sub.ok).toBe(true)
    if (sub.ok) expect(sub.filePath).toBe(path.join(BASE, 'assets', 'logo.svg'))
  })

  it('../ 逃逸被拒绝', () => {
    expect(resolveSafeFile(BASE, '../secret.txt')).toEqual({ ok: false, reason: 'escape' })
    expect(resolveSafeFile(BASE, '../../secret.txt')).toEqual({ ok: false, reason: 'escape' })
    expect(resolveSafeFile(BASE, 'sub/../../../secret.txt')).toEqual({ ok: false, reason: 'escape' })
  })

  it('URL 编码形态的 ../（%2e%2e）解码后被拒绝', () => {
    const decoded = decodeProtocolPath('%2e%2e%2fsecret.txt')
    expect(decoded).not.toBeNull()
    expect(resolveSafeFile(BASE, decoded as string)).toEqual({ ok: false, reason: 'escape' })
  })

  it('根相对绝对路径注入（/etc/passwd）被拒绝（POSIX/Windows 语义一致）', () => {
    expect(resolveSafeFile(BASE, '/etc/passwd')).toEqual({ ok: false, reason: 'escape' })
  })

  it('Windows 盘符绝对路径注入：win32 上拒绝；POSIX 上退化为基目录内文件名（不逃逸）', () => {
    const r = resolveSafeFile(BASE, 'C:\\Windows\\system32\\config.sys')
    if (process.platform === 'win32') {
      expect(r).toEqual({ ok: false, reason: 'escape' })
    } else {
      // POSIX 下反斜杠是合法文件名字符，resolve 后仍在基目录内——安全语义成立
      expect(r.ok).toBe(true)
    }
  })

  it('前缀相似目录逃逸被拒绝：plugin-a2 以 plugin-a 为字符串前缀，但分隔符校验必须拦下', () => {
    // 若前缀检查不含分隔符，BASE=.../plugin-a 会误放行 .../plugin-a2/entry.js
    const r = resolveSafeFile(BASE, '../plugin-a2/entry.js')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('escape')
  })

  it('双斜杠：路径内双斜杠被 normalize（合法时解析正确），叠加 ../ 时仍拦截', () => {
    const ok = resolveSafeFile(BASE, 'sub//file.js')
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.filePath).toBe(path.join(BASE, 'sub', 'file.js'))

    expect(resolveSafeFile(BASE, 'a//..//..//evil.txt')).toEqual({ ok: false, reason: 'escape' })
  })

  it('反斜杠分隔符逃逸：win32 上拒绝；POSIX 上为普通文件名', () => {
    const r = resolveSafeFile(BASE, '..\\..\\evil.txt')
    if (process.platform === 'win32') {
      expect(r).toEqual({ ok: false, reason: 'escape' })
    } else {
      expect(r.ok).toBe(true)
    }
  })

  it('空路径被拒绝（拒空是蓝图 §7 明确要求）', () => {
    expect(resolveSafeFile(BASE, '')).toEqual({ ok: false, reason: 'empty' })
    expect(resolveSafeFile(BASE, '/')).toEqual({ ok: false, reason: 'empty' })
    expect(resolveSafeFile(BASE, '///')).toEqual({ ok: false, reason: 'empty' })
    expect(resolveSafeFile(BASE, '.')).toEqual({ ok: false, reason: 'empty' })
    expect(resolveSafeFile(BASE, './')).toEqual({ ok: false, reason: 'empty' })
    // 归一化后回到基目录本身 = 无具体文件
    expect(resolveSafeFile(BASE, 'sub/..')).toEqual({ ok: false, reason: 'empty' })
  })

  it('嵌套回退仍在基目录内：sub/../index.js 合法且归一', () => {
    const r = resolveSafeFile(BASE, 'sub/../index.js')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.filePath).toBe(path.join(BASE, 'index.js'))
  })
})
