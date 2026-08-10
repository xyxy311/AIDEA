import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useGridMode } from '@/composables/useGridMode'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'

/**
 * Helper: Mount a renderless component that calls the composable in setup,
 * 确保 onMounted/onUnmounted 生命周期正确触发（注册/移除 window 事件监听）。
 * 同时捕获 composable 返回值供断言。
 */
let grid: ReturnType<typeof useGridMode> | null = null
function mountGrid() {
  return mount(
    defineComponent({
      setup() {
        grid = useGridMode('main')
        return () => h('div')
      },
    }),
  )
}

/** 派发 keydown 事件 */
function keydown(key: string, opts: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...opts }))
}
/** 派发 keyup 事件 */
function keyup(key: string, opts: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keyup', { key, ...opts }))
}

describe('useGridMode', () => {
  let nodeStore: ReturnType<typeof useNodeStore>
  let project: ReturnType<typeof useProjectStore>
  let view: ReturnType<typeof useViewStore>
  let history: ReturnType<typeof useHistoryStore>
  let wrapper: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    nodeStore = useNodeStore()
    project = useProjectStore()
    view = useViewStore('main')
    history = useHistoryStore()
    grid = null
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('无选中时方向键移动 activeGrid 一格（±G=100）', () => {
    view.setGridMode(true)
    view.setActiveGrid(50, 50)
    wrapper = mountGrid()

    keydown('ArrowRight')
    expect(view.activeGrid).toEqual({ x: 150, y: 50 })
    keydown('ArrowDown')
    expect(view.activeGrid).toEqual({ x: 150, y: 150 })
    keydown('ArrowLeft')
    keydown('ArrowUp')
    expect(view.activeGrid).toEqual({ x: 50, y: 50 })
  })

  it('Enter 在焦点处无节点 → 新建节点（左上角 = 焦点 - 50）并选中、编辑', () => {
    view.setGridMode(true)
    view.setActiveGrid(50, 50)
    wrapper = mountGrid()

    keydown('Enter')
    const children = nodeStore.childrenOf(project.currentNodeId)
    expect(children.length).toBe(1)
    const node = children[0]
    // 焦点 (50,50) → 左上角 (50-50, 50-50) = (0,0)
    expect(node.x).toBe(0)
    expect(node.y).toBe(0)
    expect(view.selectedNodeId).toBe(node.id)
    expect(view.editingNodeId).toBe(node.id)
  })

  it('Enter 在焦点处有节点 → 选中该节点', () => {
    const id = nodeStore.addNode(project.currentNodeId, 0, 0) // 默认 200×100，覆盖 (0,0)-(200,100)
    view.setGridMode(true)
    view.setActiveGrid(50, 50) // 落在节点 a 范围内
    wrapper = mountGrid()

    keydown('Enter')
    expect(view.selectedNodeId).toBe(id)
  })

  it('有选中时方向键移动所有直接子节点（保持相对位置）+ 入历史', () => {
    const a = nodeStore.addNode(project.currentNodeId, 0, 0)
    const b = nodeStore.addNode(project.currentNodeId, 200, 0)
    view.setSelectedNodes([a, b])
    view.setGridMode(true)
    view.setActiveGrid(50, 50)
    wrapper = mountGrid()

    keydown('ArrowRight')
    expect(nodeStore.getNode(a)!.x).toBe(100)
    expect(nodeStore.getNode(a)!.y).toBe(0)
    expect(nodeStore.getNode(b)!.x).toBe(300)

    // 单条历史入栈
    expect(history.past.length).toBe(1)
    const top = history.past[0].patch
    expect(top.nodeChanges.length).toBe(2)
    const aChange = top.nodeChanges.find((c) => c.id === a)
    expect(aChange?.old).toEqual({ x: 0, y: 0 })
    expect(aChange?.new).toEqual({ x: 100, y: 0 })
    const bChange = top.nodeChanges.find((c) => c.id === b)
    expect(bChange?.old).toEqual({ x: 200, y: 0 })
    expect(bChange?.new).toEqual({ x: 300, y: 0 })
  })

  it('Ctrl+方向键从当前焦点选最近节点（活动网格不跟随节点）', () => {
    // a 在左侧（0,0），b 在右侧（300,0）
    nodeStore.addNode(project.currentNodeId, 0, 0)
    const b = nodeStore.addNode(project.currentNodeId, 300, 0)
    view.setGridMode(true)
    view.setActiveGrid(50, 50)
    wrapper = mountGrid()

    keydown('ArrowRight', { ctrlKey: true })
    expect(view.selectedNodeId).toBe(b)
    // 活动网格保持原位，不跟随选中的节点 b
    expect(view.activeGrid).toEqual({ x: 50, y: 50 })
  })

  it('Esc 仅清空选中，活动网格不跟随节点（保持原位）', () => {
    const a = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(a)
    view.setGridMode(true)
    // 手动把焦点移到某处，验证 Esc 不改变活动网格位置
    view.setActiveGrid(500, 500)
    wrapper = mountGrid()

    keydown('Escape')
    expect(view.selectedNodeIds.size).toBe(0)
    // 活动网格保持 (500,500)，不跟随被取消选中的节点 a
    expect(view.activeGrid).toEqual({ x: 500, y: 500 })
  })

  it('连线预览：Shift按下+方向键移动+Shift释放 → 新建终点节点并连线，batch 单条历史', () => {
    const a = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(a)
    view.setGridMode(true)
    view.setActiveGrid(50, 50) // 焦点落在起点 a 范围内
    wrapper = mountGrid()

    // Shift 按下 → 以选中节点 a 为起点进入预览
    keydown('Shift')
    expect(grid!.isGridConnecting.value).toBe(true)
    expect(grid!.gridConnectingFrom.value).toBe(a)

    // 按住 Shift 期间按方向键移动活动网格（3 次向右，移出节点 a 范围 x>200）
    keydown('ArrowRight')
    keydown('ArrowRight')
    keydown('ArrowRight')
    expect(view.activeGrid).toEqual({ x: 350, y: 50 })

    // 临时连线配置可见
    expect(grid!.gridTempConn.value.visible).toBe(true)

    // Shift 释放 → 提交：焦点处无节点 → 新建终点节点 + 连线
    keyup('Shift')
    expect(grid!.isGridConnecting.value).toBe(false)
    expect(grid!.gridConnectingFrom.value).toBeNull()

    const children = nodeStore.childrenOf(project.currentNodeId)
    expect(children.length).toBe(2)
    const end = children.find((c) => c.id !== a)!
    // 焦点 (350,50) → 终点左上角 (350-50, 50-50) = (300,0)
    expect(end.x).toBe(300)
    expect(end.y).toBe(0)

    const conns = nodeStore.getConnections(project.currentNodeId)
    expect(conns.length).toBe(1)
    expect(conns[0].fromNodeId).toBe(a)
    expect(conns[0].toNodeId).toBe(end.id)

    // batch 合并为单条历史（新建终点 + 连线）
    expect(history.past.length).toBe(1)
    const top = history.past[0].patch
    expect(top.nodeChanges.length).toBe(1)
    expect(top.connChanges.length).toBe(1)
  })

  it('连线预览：起点无选中且焦点处无节点 → Shift按下新建起点，Esc取消预览回滚', () => {
    view.setGridMode(true)
    view.setActiveGrid(150, 150) // 无选中、焦点处无节点
    wrapper = mountGrid()

    keydown('Shift')
    expect(grid!.isGridConnecting.value).toBe(true)
    // 起点为新建节点
    const startId = grid!.gridConnectingFrom.value
    expect(startId).not.toBeNull()
    expect(nodeStore.getNode(startId!)).toBeTruthy()

    // Esc 取消预览
    keydown('Escape')
    expect(grid!.isGridConnecting.value).toBe(false)
    expect(grid!.gridConnectingFrom.value).toBeNull()
    // 起点新建未提交 -> 无历史入栈
    expect(history.past.length).toBe(0)
  })

  it('连线预览：起点已有 + 终点已有 → 直接连线，batch 含单条 connChange', () => {
    const a = nodeStore.addNode(project.currentNodeId, 0, 0) // 覆盖 (0,0)-(200,100)
    const b = nodeStore.addNode(project.currentNodeId, 300, 0) // 覆盖 (300,0)-(500,100)
    view.selectNode(a)
    view.setGridMode(true)
    view.setActiveGrid(50, 50) // 焦点落在起点 a 范围内
    wrapper = mountGrid()

    keydown('Shift')
    expect(grid!.gridConnectingFrom.value).toBe(a)

    // 按住 Shift 移动焦点到终点 b 范围内（4 次向右：x 50→450，落在 b 内）
    keydown('ArrowRight')
    keydown('ArrowRight')
    keydown('ArrowRight')
    keydown('ArrowRight')
    expect(view.activeGrid).toEqual({ x: 450, y: 50 })

    keyup('Shift')
    expect(grid!.isGridConnecting.value).toBe(false)

    // 未新建节点，直接连线 a→b
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(2)
    const conns = nodeStore.getConnections(project.currentNodeId)
    expect(conns.length).toBe(1)
    expect(conns[0].fromNodeId).toBe(a)
    expect(conns[0].toNodeId).toBe(b)

    // batch 单条历史：仅 1 条 connChange，无节点新建
    expect(history.past.length).toBe(1)
    const top = history.past[0].patch
    expect(top.nodeChanges.length).toBe(0)
    expect(top.connChanges.length).toBe(1)
  })

  it('连线预览：未移动（targetId===fromId）→ 取消回滚，无新增节点/连线', () => {
    const a = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.selectNode(a)
    view.setGridMode(true)
    view.setActiveGrid(50, 50) // 焦点落在起点 a 范围内
    wrapper = mountGrid()

    keydown('Shift')
    expect(grid!.gridConnectingFrom.value).toBe(a)

    // 未移动即松手 → focus 仍在起点 a 内 → 取消
    keyup('Shift')
    expect(grid!.isGridConnecting.value).toBe(false)
    expect(grid!.gridConnectingFrom.value).toBeNull()

    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(1)
    expect(nodeStore.getConnections(project.currentNodeId).length).toBe(0)
    expect(history.past.length).toBe(0)
  })

  it('连线预览：起点新建 + Shift释放提交 → 起点终点都新建，batch 含 2 nodeChange + 1 connChange', () => {
    view.setGridMode(true)
    view.setActiveGrid(50, 50) // 无选中、焦点处无节点
    wrapper = mountGrid()

    keydown('Shift')
    const startId = grid!.gridConnectingFrom.value
    expect(startId).not.toBeNull()
    expect(nodeStore.getNode(startId!)).toBeTruthy()

    // 移动焦点移出起点（3 次向右：x 50→350，起点右边界 200）
    keydown('ArrowRight')
    keydown('ArrowRight')
    keydown('ArrowRight')
    expect(view.activeGrid).toEqual({ x: 350, y: 50 })

    keyup('Shift')
    expect(grid!.isGridConnecting.value).toBe(false)

    // 起点 + 终点均新建，并连线
    expect(nodeStore.childrenOf(project.currentNodeId).length).toBe(2)
    const conns = nodeStore.getConnections(project.currentNodeId)
    expect(conns.length).toBe(1)

    // batch 单条历史：2 个 nodeChange（起点+终点）+ 1 个 connChange
    expect(history.past.length).toBe(1)
    const top = history.past[0].patch
    expect(top.nodeChanges.length).toBe(2)
    expect(top.connChanges.length).toBe(1)
  })

  it('连续方向键 coalesce 合并为单条历史（old=首次前，new=最终）', () => {
    const a = nodeStore.addNode(project.currentNodeId, 0, 0)
    view.setSelectedNodes([a])
    view.setGridMode(true)
    view.setActiveGrid(50, 50)
    wrapper = mountGrid()

    // 连按 3 次向右：x 0→100→200→300
    keydown('ArrowRight')
    keydown('ArrowRight')
    keydown('ArrowRight')
    expect(nodeStore.getNode(a)!.x).toBe(300)

    // coalesce：单条历史，old 为首次前 (0,0)，new 为最终 (300,0)
    expect(history.past.length).toBe(1)
    const top = history.past[0].patch
    expect(top.nodeChanges.length).toBe(1)
    expect(top.nodeChanges[0].old).toEqual({ x: 0, y: 0 })
    expect(top.nodeChanges[0].new).toEqual({ x: 300, y: 0 })
  })

  it('守卫回归：未开网格 / 编辑态 / 输入框焦点时不响应方向键', () => {
    view.setGridMode(true)
    view.setActiveGrid(50, 50)
    wrapper = mountGrid()

    // 未开网格：关闭 gridMode 后方向键不移动 activeGrid
    view.gridMode = false
    keydown('ArrowRight')
    expect(view.activeGrid).toEqual({ x: 50, y: 50 })

    // 编辑态：开启网格但 editingNodeId 非空 → 不响应
    view.gridMode = true
    view.editingNodeId = 'some-node'
    keydown('ArrowRight')
    expect(view.activeGrid).toEqual({ x: 50, y: 50 })
    view.editingNodeId = null

    // 输入框焦点：事件 target 为 input → 不响应
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(view.activeGrid).toEqual({ x: 50, y: 50 })
    document.body.removeChild(input)

    // 非主视图守卫由 view.type === 'main' + activeViewId 匹配结构性保证
    // （本 composable 仅被主视图实例化调用，内联视图不启用网格）
  })
})