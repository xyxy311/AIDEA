import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWhiteboardStore } from '@/stores/whiteboard'

describe('useWhiteboardStore', () => {
  beforeEach(() => {
    // 每个测试前创建全新的 Pinia 实例
    setActivePinia(createPinia())
  })

  describe('addNode', () => {
    it('should create a node with default values and return its id', () => {
      const store = useWhiteboardStore()
      const id = store.addNode(100, 200)

      const node = store.selectedNode
      expect(node).not.toBeNull()
      expect(node!.id).toBe(id)
      expect(node!.x).toBe(100)
      expect(node!.y).toBe(200)
      expect(node!.width).toBe(200) // DEFAULT_NODE_WIDTH
      expect(node!.height).toBe(120) // DEFAULT_NODE_HEIGHT
      expect(node!.text).toBe('新节点') // DEFAULT_NODE_TEXT
    })

    it('should create a node with custom text', () => {
      const store = useWhiteboardStore()
      store.addNode(100, 200, '自定义文本')

      const node = store.selectedNode
      expect(node!.text).toBe('自定义文本')
    })

    it('should set the new node as selected', () => {
      const store = useWhiteboardStore()
      store.addNode(0, 0)
      expect(store.selectedNodeId).not.toBeNull()
      expect(store.selectedNode).not.toBeNull()
    })

    it('should add node to nodesArray', () => {
      const store = useWhiteboardStore()
      store.addNode(0, 0)
      expect(store.nodesArray.length).toBe(1)

      store.addNode(100, 100)
      expect(store.nodesArray.length).toBe(2)
    })
  })

  describe('deleteNode', () => {
    it('should remove the node from the store', () => {
      const store = useWhiteboardStore()
      const id = store.addNode(0, 0)
      expect(store.nodesArray.length).toBe(1)

      store.deleteNode(id)
      expect(store.nodesArray.length).toBe(0)
    })

    it('should clear selection if deleted node was selected', () => {
      const store = useWhiteboardStore()
      const id = store.addNode(0, 0)
      expect(store.selectedNodeId).toBe(id)

      store.deleteNode(id)
      expect(store.selectedNodeId).toBeNull()
    })

    it('should not affect selection if a different node is deleted', () => {
      const store = useWhiteboardStore()
      const id1 = store.addNode(0, 0)
      const id2 = store.addNode(100, 0)
      // last added is selected (id2)
      expect(store.selectedNodeId).toBe(id2)

      store.deleteNode(id1)
      expect(store.selectedNodeId).toBe(id2)
    })
  })

  describe('selectNode', () => {
    it('should set selectedNodeId to the given id', () => {
      const store = useWhiteboardStore()
      const id = store.addNode(0, 0)
      store.selectNode(null) // first deselect
      expect(store.selectedNodeId).toBeNull()

      store.selectNode(id)
      expect(store.selectedNodeId).toBe(id)
      expect(store.selectedNode).not.toBeNull()
    })

    it('should set selectedNodeId to null when called with null', () => {
      const store = useWhiteboardStore()
      store.addNode(0, 0)
      expect(store.selectedNodeId).not.toBeNull()

      store.selectNode(null)
      expect(store.selectedNodeId).toBeNull()
      expect(store.selectedNode).toBeNull()
    })
  })

  describe('moveNode', () => {
    it('should update the node x and y position', () => {
      const store = useWhiteboardStore()
      const id = store.addNode(0, 0)

      store.moveNode(id, 300, 400)
      const node = store.selectedNode
      expect(node!.x).toBe(300)
      expect(node!.y).toBe(400)
    })

    it('should not throw for non-existent node id', () => {
      const store = useWhiteboardStore()
      expect(() => store.moveNode('nonexistent', 0, 0)).not.toThrow()
    })
  })

  describe('resizeNode', () => {
    it('should update node dimensions and position', () => {
      const store = useWhiteboardStore()
      const id = store.addNode(100, 100)

      store.resizeNode(id, 150, 150, 300, 200)
      const node = store.selectedNode
      expect(node!.x).toBe(150)
      expect(node!.y).toBe(150)
      expect(node!.width).toBe(300)
      expect(node!.height).toBe(200)
    })

    it('should enforce minimum dimensions', () => {
      const store = useWhiteboardStore()
      const id = store.addNode(100, 100)

      store.resizeNode(id, 0, 0, 50, 30)
      const node = store.selectedNode
      // width >= MIN_NODE_WIDTH (150), height >= MIN_NODE_HEIGHT (80)
      expect(node!.width).toBeGreaterThanOrEqual(150)
      expect(node!.height).toBeGreaterThanOrEqual(80)
    })
  })

  describe('setNodeText', () => {
    it('should update node text content', () => {
      const store = useWhiteboardStore()
      const id = store.addNode(0, 0, '初始文本')

      store.setNodeText(id, '修改后的文本')
      expect(store.selectedNode!.text).toBe('修改后的文本')
    })

    it('should allow empty text', () => {
      const store = useWhiteboardStore()
      const id = store.addNode(0, 0, 'Hello')

      store.setNodeText(id, '')
      expect(store.selectedNode!.text).toBe('')
    })
  })

  describe('nodesArray getter', () => {
    it('should return empty array when no nodes exist', () => {
      const store = useWhiteboardStore()
      expect(store.nodesArray).toEqual([])
    })

    it('should return all nodes as an array', () => {
      const store = useWhiteboardStore()
      const id1 = store.addNode(0, 0)
      const id2 = store.addNode(100, 100)

      const arr = store.nodesArray
      expect(arr.length).toBe(2)
      expect(arr.find(n => n.id === id1)).toBeDefined()
      expect(arr.find(n => n.id === id2)).toBeDefined()
    })
  })
})
