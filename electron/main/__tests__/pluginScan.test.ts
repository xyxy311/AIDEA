// @vitest-environment node
/**
 * pluginScan.test.ts —— 插件扫描纯逻辑单测（IO 注入，不触真实文件系统、不 import electron）。
 */
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import type { ScanIO } from '../pluginScan'
import { scanPluginDirectories, validateManifestJson } from '../pluginScan'

/** 内存 fake：dirs = 目录集合，files = 文件集合，manifests = 路径 → manifest 文本 */
function makeIo(dirs: string[], files: string[], manifests: Record<string, string> = {}): ScanIO {
  const norm = (p: string): string => path.resolve(p)
  const dirSet = new Set(dirs.map(norm))
  const fileSet = new Set(files.map(norm))
  return {
    isDirectory: (p) => dirSet.has(norm(p)),
    isFile: (p) => fileSet.has(norm(p)),
    listDirEntries: (p) => {
      // 从集合推导 p 的直接子项（仅一层）
      const prefix = norm(p) + path.sep
      const names = new Set<string>()
      for (const d of dirSet) if (d.startsWith(prefix)) names.add(d.slice(prefix.length).split(path.sep)[0])
      for (const f of fileSet) if (f.startsWith(prefix)) names.add(f.slice(prefix.length).split(path.sep)[0])
      return [...names].map((name) => ({
        name,
        isDirectory: () => dirSet.has(path.join(norm(p), name)),
      }))
    },
    readTextFile: (p) => {
      const key = norm(p)
      if (!fileSet.has(key) || !(key in manifests)) throw new Error('ENOENT（fake io：文件不存在）')
      return manifests[key]
    },
  }
}

/** 在给定根下登记一个插件目录（含指定文件） */
function plugin(root: string, id: string, files: string[]): { dirs: string[]; files: string[] } {
  const dir = path.join(root, id)
  return { dirs: [dir], files: files.map((f) => path.join(dir, f)) }
}

const VALID_MANIFEST = JSON.stringify({
  id: 'hello',
  name: '你好插件',
  version: '1.0.0',
  sdkVersion: '1.0.0',
  description: '示例',
  author: 'me',
})

describe('scanPluginDirectories', () => {
  const root = path.resolve('virtual-plugins')

  it('根目录不存在 → 空数组 + 空白名单', () => {
    const io = makeIo([], [])
    const { infos, dirs } = scanPluginDirectories(root, io)
    expect(infos).toEqual([])
    expect(dirs.size).toBe(0)
  })

  it('合法插件：产出条目 + 进入白名单 Map', () => {
    const p = plugin(root, 'hello', ['plugin.js', 'manifest.json'])
    const io = makeIo([root, ...p.dirs], [...p.files], { [path.join(root, 'hello', 'manifest.json')]: VALID_MANIFEST })
    const { infos, dirs } = scanPluginDirectories(root, io)

    expect(infos).toEqual([
      {
        id: 'hello',
        entry: 'plugin.js',
        manifest: {
          id: 'hello',
          name: '你好插件',
          version: '1.0.0',
          sdkVersion: '1.0.0',
          description: '示例',
          author: 'me',
        },
      },
    ])
    expect(dirs.get('hello')).toBe(path.join(root, 'hello'))
  })

  it('无 manifest.json → manifest 为 null 且无 error（装载时读插件内联兜底）', () => {
    const p = plugin(root, 'hello', ['plugin.js'])
    const io = makeIo([root, ...p.dirs], [...p.files])
    const { infos } = scanPluginDirectories(root, io)
    expect(infos).toEqual([{ id: 'hello', entry: 'plugin.js', manifest: null }])
  })

  it('入口优先级：plugin.js > index.js > index.mjs', () => {
    const all = plugin(root, 'all', ['plugin.js', 'index.js', 'index.mjs'])
    const two = plugin(root, 'two', ['index.js', 'index.mjs'])
    const mjs = plugin(root, 'mjs', ['index.mjs'])
    const io = makeIo(
      [root, ...all.dirs, ...two.dirs, ...mjs.dirs],
      [...all.files, ...two.files, ...mjs.files],
    )
    const { infos } = scanPluginDirectories(root, io)

    const entryOf = (id: string): string | undefined => infos.find((i) => i.id === id)?.entry
    expect(entryOf('all')).toBe('plugin.js')
    expect(entryOf('two')).toBe('index.js')
    expect(entryOf('mjs')).toBe('index.mjs')
  })

  it('无入口文件 → 跳过（不产出条目、不进白名单）', () => {
    const p = plugin(root, 'empty', ['manifest.json'])
    const io = makeIo([root, ...p.dirs], [...p.files], { [path.join(root, 'empty', 'manifest.json')]: VALID_MANIFEST })
    const { infos, dirs } = scanPluginDirectories(root, io)
    expect(infos).toEqual([])
    expect(dirs.size).toBe(0)
  })

  it('非法目录名（大写/空格/点号）→ 跳过', () => {
    const bad1 = plugin(root, 'BadName', ['plugin.js'])
    const bad2 = plugin(root, 'has space', ['plugin.js'])
    const bad3 = plugin(root, 'a.b', ['plugin.js'])
    const io = makeIo(
      [root, ...bad1.dirs, ...bad2.dirs, ...bad3.dirs],
      [...bad1.files, ...bad2.files, ...bad3.files],
    )
    const { infos, dirs } = scanPluginDirectories(root, io)
    expect(infos).toEqual([])
    expect(dirs.size).toBe(0)
  })

  it('manifest.json 损坏（非法 JSON）→ 条目带 error、manifest 置 null，但不中断扫描', () => {
    const broken = plugin(root, 'broken', ['plugin.js', 'manifest.json'])
    const good = plugin(root, 'good', ['plugin.js'])
    const io = makeIo(
      [root, ...broken.dirs, ...good.dirs],
      [...broken.files, ...good.files],
      {
        [path.join(root, 'broken', 'manifest.json')]: '{ not json !',
      },
    )
    const { infos, dirs } = scanPluginDirectories(root, io)

    expect(infos).toHaveLength(2)
    const brokenInfo = infos.find((i) => i.id === 'broken')
    expect(brokenInfo?.manifest).toBeNull()
    expect(brokenInfo?.error).toBeTruthy()
    expect(brokenInfo?.entry).toBe('plugin.js')
    // 坏 manifest 不影响后续插件
    expect(infos.find((i) => i.id === 'good')).toEqual({ id: 'good', entry: 'plugin.js', manifest: null })
    // 带 error 的条目同样获得协议授权（装载层跳过 error 条目，两者职责不同）
    expect(dirs.has('broken')).toBe(true)
  })

  it('manifest 字段缺失（少 sdkVersion）→ 条目带 error', () => {
    const p = plugin(root, 'missing', ['plugin.js', 'manifest.json'])
    const io = makeIo([root, ...p.dirs], [...p.files], {
      [path.join(root, 'missing', 'manifest.json')]: JSON.stringify({ id: 'missing', name: 'n', version: '0.1.0' }),
    })
    const { infos } = scanPluginDirectories(root, io)
    expect(infos[0]?.manifest).toBeNull()
    expect(infos[0]?.error).toContain('sdkVersion')
  })

  it('根下普通文件（README 之类）被忽略；未知文件不影响扫描', () => {
    const p = plugin(root, 'hello', ['plugin.js'])
    const io = makeIo([root, ...p.dirs], [path.join(root, 'README.md'), ...p.files])
    const { infos } = scanPluginDirectories(root, io)
    expect(infos).toEqual([{ id: 'hello', entry: 'plugin.js', manifest: null }])
  })
})

describe('validateManifestJson（对齐 shared/bridge.ts 的 PluginManifestJSON）', () => {
  it('合法清单：返回仅含已知字段的对象', () => {
    const m = validateManifestJson({
      id: 'x',
      name: 'X',
      version: '1.0.0',
      sdkVersion: '1.0.0',
      description: 'd',
      author: 'a',
      extra: '多余字段应被丢弃',
    })
    expect(m).toEqual({ id: 'x', name: 'X', version: '1.0.0', sdkVersion: '1.0.0', description: 'd', author: 'a' })
  })

  it('必填字段缺失/非字符串/空串 → 抛错', () => {
    expect(() => validateManifestJson({ name: 'n', version: '1', sdkVersion: '1' })).toThrow()
    expect(() => validateManifestJson({ id: 'x', name: 'n', version: '1', sdkVersion: 1 })).toThrow()
    expect(() => validateManifestJson({ id: '', name: 'n', version: '1', sdkVersion: '1' })).toThrow()
  })

  it('非对象输入 → 抛错', () => {
    expect(() => validateManifestJson('str')).toThrow()
    expect(() => validateManifestJson(null)).toThrow()
    expect(() => validateManifestJson([1, 2])).toThrow()
  })
})
