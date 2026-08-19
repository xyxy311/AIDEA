/**
 * nodePath - 路径拼接与保尾截断纯函数单测
 */
import { describe, it, expect } from 'vitest'
import { joinPathNames, truncatePathSegments, buildDisplayPath } from '../../utils/nodePath'

describe('joinPathNames', () => {
  it('空数组返回空串', () => {
    expect(joinPathNames([])).toBe('')
  })

  it('多个段以 "/" 分隔拼接（根在前）', () => {
    expect(joinPathNames(['根', 'a', 'b'])).toBe('根/a/b')
  })
})

describe('truncatePathSegments', () => {
  it('长度不足阈值时原样返回（不变形）', () => {
    expect(truncatePathSegments(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('长度恰好等于 keepRoot + keepTail 时原样返回', () => {
    // keepRoot=1, keepTail=2，合计 3，恰好相等
    expect(truncatePathSegments(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('超出时保留头 1 尾 2，中间以省略号折叠', () => {
    expect(truncatePathSegments(['a', 'b', 'c', 'd'])).toEqual(['a', '…', 'c', 'd'])
  })

  it('自定义 keepTail', () => {
    // keepRoot=1, keepTail=3，合计 4，长度 5 超出
    expect(truncatePathSegments(['a', 'b', 'c', 'd', 'e'], 1, 3)).toEqual(['a', '…', 'c', 'd', 'e'])
  })
})

describe('buildDisplayPath', () => {
  it('普通路径以 "/" 开头（不含根名），full 与 display 一致（未超截断阈值）', () => {
    // 3 段恰好等于 keepRoot(1)+keepTail(2)，不截断
    const names = ['a', 'b', 'c']
    const { display, full } = buildDisplayPath(names)
    expect(full).toBe('/a/b/c')
    expect(display).toBe('/a/b/c')
  })

  it('超长路径 full 为完整串、display 为保尾截断串（均以 "/" 开头）', () => {
    // 5 段超出 keepRoot(1)+keepTail(2)=3 -> 保留头 1 尾 2
    const names = ['a', 'b', 'c', 'd', 'e']
    const { display, full } = buildDisplayPath(names)
    expect(full).toBe('/a/b/c/d/e')
    expect(display).toBe('/a/…/d/e')
  })

  it('空数组（根的直接子级）返回 "/"', () => {
    const { display, full } = buildDisplayPath([])
    expect(full).toBe('/')
    expect(display).toBe('/')
  })
})