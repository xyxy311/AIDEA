import { describe, it, expect } from 'vitest'
import {
  snapPosition,
  snapSize,
  snapFocus,
  worldToGrid,
  gridToWorld,
  cellCenterToWorld,
  findNodeAtCell,
  nearestNodeInDirection,
  type GridDirection,
} from '../../utils/grid'
import type { WhiteboardNode } from '../../types'

// ===================================================================
// snapPosition / snapSize（取整语义）
// ===================================================================
describe('snapPosition', () => {
  it('四舍五入到 100 的倍数', () => {
    expect(snapPosition(0)).toBe(0)
    expect(snapPosition(49)).toBe(0)
    expect(snapPosition(50)).toBe(100)
    expect(snapPosition(150)).toBe(200)
    expect(snapPosition(251)).toBe(300)
  })

  it('支持负值', () => {
    // 避开 -50 边界（Math.round(-0.5) 在 JS 中产生 -0）
    expect(snapPosition(-51)).toBe(-100)
    expect(snapPosition(-149)).toBe(-100)
    expect(snapPosition(-199)).toBe(-200)
  })
})

describe('snapFocus', () => {
  it('吸附到单元格中心（50 + 100n，即 50, 150, 250…）', () => {
    // v ∈ [0,100) 的单元格中心为 50
    expect(snapFocus(0)).toBe(50)
    expect(snapFocus(24)).toBe(50)
    expect(snapFocus(49)).toBe(50)
    expect(snapFocus(50)).toBe(50)
    expect(snapFocus(75)).toBe(50)
    // v ∈ [100,200) 的单元格中心为 150
    expect(snapFocus(120)).toBe(150)
    expect(snapFocus(149)).toBe(150)
    expect(snapFocus(150)).toBe(150)
    expect(snapFocus(175)).toBe(150)
    // 边界：v=200 时 (200-50)/100=1.5 → round=2 → 250
    expect(snapFocus(200)).toBe(250)
  })

  it('支持负值（仍吸附到单元格中心）', () => {
    // v ∈ [-100,0) 的单元格中心为 -50
    expect(snapFocus(-24)).toBe(-50)
    expect(snapFocus(-51)).toBe(-50)
    expect(snapFocus(-75)).toBe(-50)
    // JS Math.round 对 .5 向 +∞ 取整：v=-100 时 (-150)/100=-1.5 → round=-1 → -50
    expect(snapFocus(-100)).toBe(-50)
    expect(snapFocus(-150)).toBe(-150)
  })
})

describe('snapSize', () => {
  it('向上取整到 100 的倍数', () => {
    expect(snapSize(0)).toBe(0)
    expect(snapSize(1)).toBe(100)
    expect(snapSize(100)).toBe(100)
    expect(snapSize(101)).toBe(200)
    expect(snapSize(250)).toBe(300)
  })

  it('与 round 不同：非整百一律进位', () => {
    // round(150/100)=200，而孤取整应 200
    expect(snapSize(101)).not.toBe(100)
  })
})

// ===================================================================
// worldToGrid / gridToWorld / cellCenterToWorld
// ===================================================================
describe('worldToGrid / gridToWorld', () => {
  it('worldToGrid 向下取整得到单元索引', () => {
    expect(worldToGrid(0)).toBe(0)
    expect(worldToGrid(99)).toBe(0)
    expect(worldToGrid(100)).toBe(1)
    expect(worldToGrid(250)).toBe(2)
    expect(worldToGrid(-1)).toBe(-1)
  })

  it('gridToWorld 为索引的 100 倍', () => {
    expect(gridToWorld(0)).toBe(0)
    expect(gridToWorld(2)).toBe(200)
    expect(gridToWorld(-1)).toBe(-100)
  })
})

describe('cellCenterToWorld', () => {
  it('焦点中心在 50 的倍数（= 索引*100 + 50）', () => {
    expect(cellCenterToWorld(0)).toBe(50)
    expect(cellCenterToWorld(1)).toBe(150)
    expect(cellCenterToWorld(2)).toBe(250)
    expect(cellCenterToWorld(-1)).toBe(-50)
  })

  it('焦点坐标是 50 的整数倍', () => {
    for (const g of [-2, -1, 0, 1, 3, 5]) {
      expect(Math.abs(cellCenterToWorld(g) % 50)).toBe(0)
    }
  })
})

// ===================================================================
// findNodeAtCell
// ===================================================================
const rectNodes = [
  { id: 'a', x: 100, y: 100, width: 200, height: 100 },
  { id: 'b', x: 400, y: 300, width: 100, height: 100 },
]

describe('findNodeAtCell', () => {
  it('命中内部点', () => {
    expect(findNodeAtCell({ nodes: rectNodes, x: 150, y: 150 })).toBe('a')
    expect(findNodeAtCell({ nodes: rectNodes, x: 450, y: 350 })).toBe('b')
  })

  it('边界含边（左右/上下边命中）', () => {
    expect(findNodeAtCell({ nodes: rectNodes, x: 100, y: 150 })).toBe('a') // 左边界
    expect(findNodeAtCell({ nodes: rectNodes, x: 300, y: 150 })).toBe('a') // 右边界
    expect(findNodeAtCell({ nodes: rectNodes, x: 150, y: 100 })).toBe('a') // 上边界
    expect(findNodeAtCell({ nodes: rectNodes, x: 150, y: 200 })).toBe('a') // 下边界
  })

  it('未命中返回 null', () => {
    expect(findNodeAtCell({ nodes: rectNodes, x: 0, y: 0 })).toBeNull()
    expect(findNodeAtCell({ nodes: rectNodes, x: 350, y: 150 })).toBeNull()
    expect(findNodeAtCell({ nodes: rectNodes, x: 150, y: 250 })).toBeNull()
  })

  it('空列表返回 null', () => {
    expect(findNodeAtCell({ nodes: [], x: 150, y: 150 })).toBeNull()
  })
})

// ===================================================================
// nearestNodeInDirection
// ===================================================================
function makeNode(partial: Partial<WhiteboardNode> & { id: string }): WhiteboardNode {
  return {
    text: '',
    parentId: 'root',
    borderColor: '#000',
    connections: [],
    tagIds: [],
    ...partial,
  } as WhiteboardNode
}

describe('nearestNodeInDirection', () => {
  it('right 方向选最近节点（按左边界投影距离）', () => {
    const nodes = [
      makeNode({ id: 'near', x: 200, y: 0, width: 100, height: 100 }),
      makeNode({ id: 'far', x: 500, y: 0, width: 100, height: 100 }),
    ]
    const res = nearestNodeInDirection(nodes, 0, 50, 'right')
    expect(res).not.toBeNull()
    expect(res!.id).toBe('near')
  })

  it('left 方向选最近节点（按右边界投影距离）', () => {
    const nodes = [
      makeNode({ id: 'near', x: -200, y: 0, width: 100, height: 100 }),
      makeNode({ id: 'far', x: -500, y: 0, width: 100, height: 100 }),
    ]
    const res = nearestNodeInDirection(nodes, 0, 50, 'left')
    expect(res!.id).toBe('near')
  })

  it('down 方向选最近节点', () => {
    const nodes = [
      makeNode({ id: 'near', x: 0, y: 200, width: 100, height: 100 }),
      makeNode({ id: 'far', x: 0, y: 500, width: 100, height: 100 }),
    ]
    const res = nearestNodeInDirection(nodes, 50, 0, 'down')
    expect(res!.id).toBe('near')
  })

  it('up 方向选最近节点', () => {
    const nodes = [
      makeNode({ id: 'near', x: 0, y: -200, width: 100, height: 100 }),
      makeNode({ id: 'far', x: 0, y: -500, width: 100, height: 100 }),
    ]
    const res = nearestNodeInDirection(nodes, 50, 0, 'up')
    expect(res!.id).toBe('near')
  })

  it('正交区间无重叠（斜向太偏）则不选中', () => {
    // 节点 y 区间 [0,100]，起点 y=500，无重叠 → right 方向不命中
    const nodes = [makeNode({ id: 'a', x: 200, y: 0, width: 100, height: 100 })]
    const res = nearestNodeInDirection(nodes, 0, 500, 'right')
    expect(res).toBeNull()
  })

  it('方向半平面之外不选中（起点已在节点 x 区间内/右侧）', () => {
    // 起点 x=0 落在节点 [0,100] 内，节点左边界不满足 > fromX → 不命中
    const nodes = [makeNode({ id: 'a', x: 0, y: 0, width: 100, height: 100 })]
    const res = nearestNodeInDirection(nodes, 50, 50, 'right')
    expect(res).toBeNull()
  })

  it('空列表返回 null', () => {
    expect(nearestNodeInDirection([], 0, 0, 'right')).toBeNull()
  })

  it('返回完整节点对象', () => {
    const src: WhiteboardNode = makeNode({ id: 'a', x: 200, y: 0, width: 100, height: 100 })
    const res = nearestNodeInDirection([src], 0, 50, 'right')
    expect(res).toBe(src)
    expect(res!.width).toBe(100)
  })

  it('空列表在任意方向均返回 null', () => {
    const dirs: GridDirection[] = ['up', 'down', 'left', 'right']
    for (const dir of dirs) {
      const res = nearestNodeInDirection([], 0, 0, dir)
      expect(res).toBeNull()
    }
  })

  it('四方向均有重叠候选时选出最近节点（点-区间重叠）', () => {
    // 起点 (50, 50)：四个方向各放一个节点，焦点正交投影均落在节点区间内
    const nodes: WhiteboardNode[] = [
      makeNode({ id: 'right', x: 200, y: 0, width: 100, height: 200 }), // x 区间 [200,300] 在右
      makeNode({ id: 'left', x: -200, y: 0, width: 100, height: 200 }), // x 区间 [-200,-100] 在左
      makeNode({ id: 'down', x: 0, y: 200, width: 200, height: 100 }), // y 区间 [200,300] 在下
      makeNode({ id: 'up', x: 0, y: -200, width: 200, height: 100 }), // y 区间 [-200,-100] 在上
    ]
    expect(nearestNodeInDirection(nodes, 50, 50, 'right')!.id).toBe('right')
    expect(nearestNodeInDirection(nodes, 50, 50, 'left')!.id).toBe('left')
    expect(nearestNodeInDirection(nodes, 50, 50, 'down')!.id).toBe('down')
    expect(nearestNodeInDirection(nodes, 50, 50, 'up')!.id).toBe('up')
  })

  it('等距节点取先入者（projDist 严格小于才替换）', () => {
    // 两个节点距起点 right 方向投影距离相等（均为 100），且 y 区间均重叠，
    // 应保持列表先出现的 'first'（projDist 严格小于才替换 best）。
    const nodes: WhiteboardNode[] = [
      makeNode({ id: 'first', x: 200, y: 0, width: 100, height: 100 }),
      makeNode({ id: 'second', x: 200, y: 0, width: 100, height: 100 }),
    ]
    const res = nearestNodeInDirection(nodes, 100, 50, 'right')
    expect(res!.id).toBe('first')
  })
})