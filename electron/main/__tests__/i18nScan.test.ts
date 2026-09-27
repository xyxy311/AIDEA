// @vitest-environment node
/**
 * i18nScan.test.ts —— 运行时 i18n 目录扫描纯逻辑单测（IO 注入，不触真实文件系统、不 import electron）。
 */
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import type { I18nScanIO } from '../i18nScan'
import { scanI18nFiles } from '../i18nScan'

/** 内存 fake：dirs = 目录集合，files = 文件集合，contents = 路径 → 语言文件文本 */
function makeIo(dirs: string[], files: string[], contents: Record<string, string>): I18nScanIO {
  const norm = (p: string): string => path.resolve(p)
  const dirSet = new Set(dirs.map(norm))
  const fileSet = new Set(files.map(norm))
  return {
    isDirectory: (p) => dirSet.has(norm(p)),
    listDirEntries: (p) => {
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
      if (!fileSet.has(key) || !(key in contents)) throw new Error('ENOENT（fake io：文件不存在）')
      return contents[key]
    },
  }
}

/** 生成一个合规范语言包文本（@meta + 一个分区） */
function bundle(id: string, label: string, naiveBase?: string): string {
  return JSON.stringify({
    '@meta': { id, label, naiveBase: naiveBase ?? 'en-US' },
    common: { confirm: 'OK', cancel: 'Cancel' },
  })
}

const root = path.resolve('virtual-i18n')

describe('scanI18nFiles', () => {
  it('根目录不存在 → 空清单 + 空白名单', () => {
    const { infos, files } = scanI18nFiles(root, makeIo([], [], {}))
    expect(infos).toEqual([])
    expect(files.size).toBe(0)
  })

  it('合法语言包：产出条目 + 进入白名单 Map', () => {
    const io = makeIo([root], [path.join(root, 'es-ES.json')], {
      [path.join(root, 'es-ES.json')]: bundle('es-ES', 'Español'),
    })
    const { infos, files } = scanI18nFiles(root, io)
    expect(infos).toEqual([{ id: 'es-ES', label: 'Español', naiveBase: 'en-US' }])
    expect(files.get('es-ES')).toBe(path.join(root, 'es-ES.json'))
  })

  it('naiveBase 缺省默认 en-US；显式指定则取指定值', () => {
    const io = makeIo([root], [path.join(root, 'zh-TW.json'), path.join(root, 'ja-JP.json')], {
      [path.join(root, 'zh-TW.json')]: bundle('zh-TW', '繁體中文'),
      [path.join(root, 'ja-JP.json')]: bundle('ja-JP', '日本語', 'ja-JP'),
    })
    const { infos } = scanI18nFiles(root, io)
    expect(infos.find((i) => i.id === 'zh-TW')?.naiveBase).toBe('en-US')
    expect(infos.find((i) => i.id === 'ja-JP')?.naiveBase).toBe('ja-JP')
  })

  it('无 @meta → 跳过（不产出、不进白名单），不影响其它文件', () => {
    const io = makeIo([root], [path.join(root, 'bad.json'), path.join(root, 'ok.json')], {
      [path.join(root, 'bad.json')]: JSON.stringify({ common: { confirm: 'OK' } }),
      [path.join(root, 'ok.json')]: bundle('ok', 'Ok'),
    })
    const { infos, files } = scanI18nFiles(root, io)
    expect(infos.map((i) => i.id)).toEqual(['ok'])
    expect(files.has('bad')).toBe(false)
  })

  it('@meta.id 与文件名不一致 → 跳过', () => {
    // 文件名 zh-CN.json 但 @meta.id = es-ES → 拒绝（id 以文件名为准，防止伪装/混乱）
    const io = makeIo([root], [path.join(root, 'zh-CN.json')], {
      [path.join(root, 'zh-CN.json')]: bundle('es-ES', 'Español'),
    })
    const { infos, files } = scanI18nFiles(root, io)
    expect(infos).toEqual([])
    expect(files.size).toBe(0)
  })

  it('损坏 JSON → 跳过', () => {
    const io = makeIo([root], [path.join(root, 'broken.json')], {
      [path.join(root, 'broken.json')]: '{ not json !',
    })
    const { infos } = scanI18nFiles(root, io)
    expect(infos).toEqual([])
  })

  it('文件名 id 非法（空格 / 点号 / 仅大小写字母外）→ 跳过', () => {
    const io = makeIo(
      [root],
      [path.join(root, 'has space.json'), path.join(root, 'a.b.json')],
      {
        [path.join(root, 'has space.json')]: bundle('has space', 'X'),
        [path.join(root, 'a.b.json')]: bundle('a.b', 'X'),
      },
    )
    const { infos } = scanI18nFiles(root, io)
    expect(infos).toEqual([])
  })

  it('非 .json 文件与子目录被忽略', () => {
    const io = makeIo([root, path.join(root, 'subdir')], [path.join(root, 'README.md'), path.join(root, 'es-ES.json')], {
      [path.join(root, 'es-ES.json')]: bundle('es-ES', 'Español'),
    })
    const { infos } = scanI18nFiles(root, io)
    expect(infos.map((i) => i.id)).toEqual(['es-ES'])
  })

  it('多语言：输出去重键按 id 字典序排序', () => {
    const io = makeIo(
      [root],
      [path.join(root, 'zh-TW.json'), path.join(root, 'es-ES.json'), path.join(root, 'de-DE.json')],
      {
        [path.join(root, 'zh-TW.json')]: bundle('zh-TW', '繁體中文'),
        [path.join(root, 'es-ES.json')]: bundle('es-ES', 'Español'),
        [path.join(root, 'de-DE.json')]: bundle('de-DE', 'Deutsch'),
      },
    )
    const { infos } = scanI18nFiles(root, io)
    expect(infos.map((i) => i.id)).toEqual(['de-DE', 'es-ES', 'zh-TW'])
  })
})