// @vitest-environment node
/**
 * mime.test.ts —— 协议响应 MIME 推断单测。
 * 硬要求：.js/.mjs 必须 text/javascript（ESM 动态 import 对 MIME 严格校验，错了直接加载失败）。
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_MIME, pickMimeType } from '../mime'

describe('pickMimeType', () => {
  it('脚本类扩展名必须为 text/javascript（模块加载硬要求）', () => {
    expect(pickMimeType('entry.js')).toBe('text/javascript')
    expect(pickMimeType('module.mjs')).toBe('text/javascript')
  })

  it('常见扩展名映射', () => {
    expect(pickMimeType('manifest.json')).toBe('application/json')
    expect(pickMimeType('style.css')).toBe('text/css')
    expect(pickMimeType('core.wasm')).toBe('application/wasm')
    expect(pickMimeType('logo.svg')).toBe('image/svg+xml')
    expect(pickMimeType('logo.png')).toBe('image/png')
    expect(pickMimeType('bg.webp')).toBe('image/webp')
    expect(pickMimeType('anim.gif')).toBe('image/gif')
    expect(pickMimeType('index.html')).toBe('text/html') // app 协议默认文档
  })

  it('扩展名大小写不敏感', () => {
    expect(pickMimeType('MANIFEST.JSON')).toBe('application/json')
    expect(pickMimeType('Entry.JS')).toBe('text/javascript')
  })

  it('未识别扩展名 / 无扩展名 → application/octet-stream', () => {
    expect(pickMimeType('blob.binxyz')).toBe(DEFAULT_MIME)
    expect(pickMimeType('noext')).toBe(DEFAULT_MIME)
    expect(pickMimeType('.hidden')).toBe(DEFAULT_MIME) // 隐藏文件不算扩展名
  })
})
