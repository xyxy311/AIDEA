import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createPluginAdapter } from '@/plugin/adapter'
import { ROOT_NODE_ID } from '@/stores/node'
import { useStageSize } from '@/composables/useStageSize'

/**
 * 插件视图域扩展 API 测试（视口 / 选中 / 编辑态 / 内联视图 / 网格）。
 * 全部为视图状态操作（不入历史、不带 user）。只读 getter 返回结构化快照；
 * 视图态写经 store 修改后，由对应只读 getter / selection() 确认状态确实被改变。
 */
function makeView() {
  return createPluginAdapter().api.view
}

function makeAll() {
  return createPluginAdapter().api
}

describe('插件视图域扩展 API', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ── 视口 ──
  it('视口 getter 默认返回原点 + 缩放 1', () => {
    const view = makeView()
    expect(view.stageX()).toBe(0)
    expect(view.stageY()).toBe(0)
    expect(view.stageScale()).toBe(1)
  })

  it('setViewport 平移 + 缩放，并反映到只读 getter', () => {
    const view = makeView()
    view.setViewport(120, 80, 2)
    expect(view.stageX()).toBe(120)
    expect(view.stageY()).toBe(80)
    expect(view.stageScale()).toBe(2)
  })

  it('viewportCenterWorld: 视口中心换算为世界坐标', () => {
    const view = makeView()
    // 测试环境未注册画布容器，stageWidth/Height 走 useStageSize 的窗口回退值
    //（happy-dom 固定窗口 1024x768 - 顶部条常量），从同一来源读取实测值反推期望，
    // 断言换算公式：world = (screenCenter - offset) / scale（等价于
    // stageX=100, scale=2, stageWidth=800 时 x=(400-100)/2=150 的装配思路）。
    const { stageWidth, stageHeight } = useStageSize()
    view.setViewport(100, 50, 2)
    expect(view.viewportCenterWorld()).toEqual({
      x: (stageWidth.value / 2 - 100) / 2,
      y: (stageHeight.value / 2 - 50) / 2,
    })
    // 默认视口（无偏移 + 缩放 1）时中心即画布正中
    view.setViewport(0, 0, 1)
    expect(view.viewportCenterWorld()).toEqual({
      x: stageWidth.value / 2,
      y: stageHeight.value / 2,
    })
  })

  // ── 选中 ──
  it('setSelectedNodes 替换 / 追加选中节点', () => {
    const all = makeAll()
    const view = all.view
    const a = all.node.create(ROOT_NODE_ID, 0, 0, 'A')!
    const b = all.node.create(ROOT_NODE_ID, 100, 0, 'B')!

    view.setSelectedNodes([a])
    expect(view.selection().nodeIds).toEqual([a])

    // additive=true 追加，而非替换
    view.setSelectedNodes([b], true)
    expect(view.selection().nodeIds.slice().sort()).toEqual([a, b].slice().sort())
  })

  it('selectConnection 选中连线（节点与连线互斥）', () => {
    const all = makeAll()
    const view = all.view
    const a = all.node.create(ROOT_NODE_ID, 0, 0, 'A')!
    const b = all.node.create(ROOT_NODE_ID, 100, 0, 'B')!
    const connId = all.connection.add(ROOT_NODE_ID, a, b)!

    view.selectConnection(connId)
    expect(view.selection().connectionIds).toContain(connId)
    // 选中连线时节点选择被清空
    expect(view.selection().nodeIds).toEqual([])
  })

  it('pruneSelection 移除已不存在的选中节点 / 连线', () => {
    const all = makeAll()
    const view = all.view
    const a = all.node.create(ROOT_NODE_ID, 0, 0, 'A')!
    const b = all.node.create(ROOT_NODE_ID, 100, 0, 'B')!

    // setSelectedNodes / selectConnection 不校验存在性，可注入不存在的「幽灵」ID 模拟脏选中
    view.setSelectedNodes([a, b, 'ghost-node'])
    expect(view.selection().nodeIds).toContain('ghost-node')

    view.pruneSelection()
    expect(view.selection().nodeIds).toEqual([a, b])

    // 连线同理：注入不存在的连线 ID 后被清理（选中连线时节点选择被清空，互斥）
    view.setSelectedNodes([a])
    view.selectConnection('ghost-conn')
    expect(view.selection().connectionIds).toEqual(['ghost-conn'])

    view.pruneSelection()
    expect(view.selection().connectionIds).toEqual([])
    expect(view.selection().nodeIds).toEqual([])
  })

  // ── 编辑态 ──
  it('startEditing / stopEditing 改变编辑态', () => {
    const all = makeAll()
    const view = all.view
    const a = all.node.create(ROOT_NODE_ID, 0, 0, 'A')!

    expect(view.editingNodeId()).toBeNull()
    view.startEditing(a)
    expect(view.editingNodeId()).toBe(a)
    view.stopEditing()
    expect(view.editingNodeId()).toBeNull()
  })

  // ── 内联视图 ──
  it('addInlineView / updateInlineViewSize / removeInlineView 增删改内联视图', () => {
    const all = makeAll()
    const view = all.view
    const a = all.node.create(ROOT_NODE_ID, 0, 0, 'A')!

    expect(view.inlineViews()).toEqual([])
    view.addInlineView(a, 'view-inline-a', 300, 200)
    expect(view.inlineViews()).toEqual([{ nodeId: a, width: 300, height: 200 }])

    // 已存在同 nodeId 则忽略（不重复添加）
    view.addInlineView(a, 'view-inline-a2', 999, 999)
    expect(view.inlineViews()).toHaveLength(1)

    // 更新尺寸
    view.updateInlineViewSize(a, 420, 360)
    expect(view.inlineViews()).toEqual([{ nodeId: a, width: 420, height: 360 }])

    // 移除
    view.removeInlineView(a)
    expect(view.inlineViews()).toEqual([])
  })

  // ── 网格模式 ──
  it('setGridMode / toggleGridMode 改变网格模式', () => {
    const view = makeView()

    expect(view.gridMode()).toBe(false)
    view.setGridMode(true)
    expect(view.gridMode()).toBe(true)
    view.toggleGridMode()
    expect(view.gridMode()).toBe(false)
    view.toggleGridMode()
    expect(view.gridMode()).toBe(true)
  })
})