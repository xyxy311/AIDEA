import { describe, it, expect } from 'vitest'
import {
  serializeProject,
  PROJECT_FILE_VERSION,
  type ProjectViewState,
} from '@/utils/projectFile'
import { createNode } from '@/utils/factory'
import { ROOT_NODE_ID } from '@/stores/node'

/** 构造一个最小合法视图状态 */
function validViewState(): ProjectViewState {
  return {
    viewedNodeId: ROOT_NODE_ID,
    stageX: 0,
    stageY: 0,
    stageScale: 1,
    expandedIds: [ROOT_NODE_ID],
    inlineViews: [],
    selectedNodeIds: [],
    selectedConnectionIds: [],
  }
}

describe('projectFile - 序列化', () => {
  it('serializeProject 写出 additions 字段（插件项目化数据原样写出）', () => {
    const nodes = [
      createNode({ id: ROOT_NODE_ID, parentId: null, text: '项目' }),
      createNode({ id: 'child1', parentId: ROOT_NODE_ID, text: '子节点' }),
    ]

    const json = serializeProject(nodes, '项目', validViewState(), [], { 'stats:counter': { count: 3 } })
    const data = JSON.parse(json)

    expect(data.additions).toEqual({ 'stats:counter': { count: 3 } })
  })

  it('版本号恒为 1', () => {
    const nodes = [createNode({ id: ROOT_NODE_ID, parentId: null, text: '项目' })]
    const json = serializeProject(nodes, '项目', validViewState(), [], {})
    const data = JSON.parse(json)
    expect(data.version).toBe(PROJECT_FILE_VERSION)
  })
})
