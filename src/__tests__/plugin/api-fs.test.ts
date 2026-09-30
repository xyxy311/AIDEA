import { describe, it, expect, vi } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 测试用假桥，放宽只为容忍 vi.fn 的参数签名
type AnyBridge = Record<string, (...args: any[]) => any>
interface WinWithFs {
  aideaFs: unknown
}

/** 注入假桥后全新装载 api.fs（useNativeFs 在模块加载时读 window.aideaFs，故需 resetModules 重载） */
async function makeFsApi(bridge: AnyBridge) {
  ;(window as unknown as WinWithFs).aideaFs = bridge
  vi.resetModules()
  const { createFsApi } = await import('@/plugin/api/fs')
  return createFsApi()
}

describe('api.fs（通用文件桥代理）', () => {
  it('open/save/read/write 原样转发到 window.aideaFs', async () => {
    const openResult = { canceled: false, path: '/p', name: 'a.txt', content: 'hello' }
    const bridge = {
      open: vi.fn(async () => openResult),
      save: vi.fn(async () => ({ canceled: true })),
      read: vi.fn(async (r: { path: string }) => ({ path: r.path, content: 'x' })),
      write: vi.fn(async () => undefined),
    }
    const api = await makeFsApi(bridge)

    await expect(api.open({ mode: 'text' })).resolves.toEqual(openResult)
    expect(bridge.open).toHaveBeenCalledWith({ mode: 'text' })

    await expect(api.save({ mode: 'text', content: 'hi' })).resolves.toEqual({ canceled: true })
    expect(bridge.save).toHaveBeenCalledWith({ mode: 'text', content: 'hi' })

    await expect(api.read({ path: '/p', mode: 'text' })).resolves.toEqual({
      path: '/p',
      content: 'x',
    })
    expect(bridge.read).toHaveBeenCalledWith({ path: '/p', mode: 'text' })

    await expect(api.write({ path: '/p', mode: 'binary', bytes: new Uint8Array() })).resolves.toBeUndefined()
    expect(bridge.write).toHaveBeenCalledWith({ path: '/p', mode: 'binary', bytes: new Uint8Array() })
  })

  it('binary 载荷原样透传 Uint8Array', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const api = await makeFsApi({
      read: vi.fn(async () => ({ path: '/b', bytes })),
    })
    await expect(api.read({ path: '/b', mode: 'binary' })).resolves.toEqual({ path: '/b', bytes })
  })

  it('toArrayBuffer / bytesToHex 二进制解析原语', async () => {
    const api = await makeFsApi({})
    expect(api.bytesToHex(Uint8Array.from([0x61, 0x42, 0xff]))).toBe('6142ff')
    expect(api.toArrayBuffer(Uint8Array.from([1, 2, 3])).byteLength).toBe(3)
  })
})