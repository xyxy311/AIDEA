import { describe, it, expect } from 'vitest'
import { adapter } from '@/plugin/adapter'

describe('adapter.api.fs 装配（fs 域接入插件 SDK 面）', () => {
  it('fs 域已暴露 open/save/read/write 与二进制解析原语', () => {
    const fs = adapter.api.fs
    expect(typeof fs.open).toBe('function')
    expect(typeof fs.save).toBe('function')
    expect(typeof fs.read).toBe('function')
    expect(typeof fs.write).toBe('function')
    expect(typeof fs.bytesToHex).toBe('function')
    expect(typeof fs.toArrayBuffer).toBe('function')
  })
})