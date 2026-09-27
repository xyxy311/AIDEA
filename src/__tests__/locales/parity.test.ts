/**
 * 语言包 key 对齐（parity）测试
 *
 * 展平 zh-CN.json（内置）与 i18n-runtime/en-US.json（运行时资源，也是功能测试夹具）的嵌套结构
 * （分区.键 → 点路径），断言两个语言的 key 集合双向一致：zh 独有 = [] 且 en 独有 = []。
 * 任何一侧漏翻 / 多出 key 都在此红灯，防止切换语言后部分文案回退或缺失。
 *
 * 与 t() 运行时回退链（当前语言 → zh-CN → key 本身）互补：
 * 回退链只兜运行期缺 key 的兜底展示，本测试是资源文件的编译期守护。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import zhCN from '@/locales/zh-CN.json'

// en-US 已从源码移入运行时目录（编年期内置，不入 bundle）；测试经 fs 读取，验证它确为规范语言包
const enUS = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'i18n-runtime/en-US.json'), 'utf-8'),
) as Record<string, unknown>

/** 递归展平嵌套对象为点路径 key 集合（叶子即文案字符串，只收集路径不关心内容） */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const p = prefix ? `${prefix}.${key}` : key
    return value !== null && typeof value === 'object'
      ? flattenKeys(value as Record<string, unknown>, p)
      : [p]
  })
}

describe('语言包 key 对齐（zh-CN / en-US parity）', () => {
  const zhKeys = new Set(flattenKeys(zhCN))
  const enKeys = new Set(flattenKeys(enUS))

  it('zh-CN 独有 key 为空（en-US 不缺翻译）', () => {
    const zhOnly = [...zhKeys].filter((key) => !enKeys.has(key))
    expect(zhOnly).toEqual([])
  })

  it('en-US 独有 key 为空（zh-CN 不缺翻译）', () => {
    const enOnly = [...enKeys].filter((key) => !zhKeys.has(key))
    expect(enOnly).toEqual([])
  })
})