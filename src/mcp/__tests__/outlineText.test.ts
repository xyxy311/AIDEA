// src/mcp/__tests__/outlineText.test.ts —— 索引层大纲：深度截断 / 行数上限 / 全叶子退化 / 计数 / additions 键名
import { describe, expect, it } from 'vitest'
import { buildOutline, type OutlineEntry } from '../outlineText'

function leaf(id: string, label = id): OutlineEntry {
  return { id, handle: id, label, tagNames: [], styleName: null, additionKeys: [], childCount: 0, leafCount: 0, children: [] }
}

/** 容器：children 全量挂载；leafCount 由调用方给定（模拟真实计数） */
function container(id: string, children: OutlineEntry[], leafCount: number): OutlineEntry {
  return {
    id,
    handle: id,
    label: id,
    tagNames: [],
    styleName: null,
    additionKeys: [],
    childCount: children.length,
    leafCount,
    children,
  }
}

describe('buildOutline（§4.4）', () => {
  it('深度截断：depth=1 只列直接子节点，孙层不展开', () => {
    const grand = leaf('g')
    const child = container('c', [grand], 1)
    const root = container('root', [child], 1)
    const out = buildOutline(root, { depth: 1, limit: 50, leafPreview: 5, titlePath: '/P' })
    const lines = out.text.split('\n')
    expect(lines).toHaveLength(3) // 头行 + ROOT + c
    expect(lines[2]).toContain('+1 子, +1 叶')
    expect(out.text).not.toContain('Ng')
    expect(out.truncated).toBe(false)
  })

  it('depth=3 展开到孙层；容器行带 (+K 子, +L 叶)', () => {
    const grand = leaf('g')
    const child = container('c', [grand], 1)
    const root = container('root', [child], 1)
    const out = buildOutline(root, { depth: 3, limit: 50, leafPreview: 5, titlePath: '/P' })
    expect(out.text).toContain('Ng g')
  })

  it('全叶子退化：父的子节点全是叶子 → 列前 leafPreview 个叶子名', () => {
    const leaves = Array.from({ length: 19 }, (_, i) => leaf(`l${i}`))
    const root = container('root', leaves, 19)
    const out = buildOutline(root, { depth: 3, limit: 50, leafPreview: 5 })
    expect(out.text).toContain('ROOT Nroot root (+19 子, +19 叶)')
    for (let i = 0; i < 5; i++) expect(out.text).toContain(`Nl${i} l${i}`)
    expect(out.text).not.toContain('Nl5')
    expect(out.truncated).toBe(false)
  })

  it('混合层：叶子只计数不列行，容器列行（其下全叶子退化仍列预览）', () => {
    const leafA = leaf('la')
    const sub = container('sub', [leaf('inner')], 1)
    const root = container('root', [leafA, sub], 2)
    const out = buildOutline(root, { depth: 3, limit: 50, leafPreview: 5 })
    expect(out.text).toContain('Nsub sub (+1 子, +1 叶)')
    expect(out.text).not.toContain('Nla la') // 混合层叶子只计数
    expect(out.text).toContain('Ninner inner') // sub 的子节点全是叶子 → 列预览
  })

  it('limit 截断：置 truncated 并提示 rootId 下钻', () => {
    const leaves = Array.from({ length: 20 }, (_, i) => leaf(`l${i}`))
    const root = container('root', leaves, 20)
    const out = buildOutline(root, { depth: 3, limit: 5, leafPreview: 20 })
    expect(out.truncated).toBe(true)
    expect(out.text).toContain('rootId')
  })

  it('includeAdditions：additionKeys 只列键名（根行追加）', () => {
    const root = container('root', [leaf('a')], 1)
    root.additionKeys = ['demo:notes', 'demo:cache']
    const out = buildOutline(root, { depth: 1, limit: 50, leafPreview: 5 })
    expect(out.text).toContain('demo:notes | demo:cache')
  })

  it('标签与样式槽位按序渲染，空槽省略', () => {
    const tagged: OutlineEntry = { ...leaf('x'), tagNames: ['主线'], styleName: 'Blue' }
    const root = container('root', [tagged], 1)
    const out = buildOutline(root, { depth: 1, limit: 50, leafPreview: 5 })
    expect(out.text).toContain('Nx x | 主线 | Blue')
  })

  it('叶计数不受 depth 限制（真实子树计数）', () => {
    const deep = container('deep', [leaf('d1'), leaf('d2')], 2)
    const mid = container('mid', [deep], 2)
    const root = container('root', [mid], 2)
    const out = buildOutline(root, { depth: 1, limit: 50, leafPreview: 5 })
    expect(out.text).toContain('Nmid mid (+1 子, +2 叶)')
  })
})
