import { ref, computed, shallowRef, triggerRef } from 'vue'
import { defineStore } from 'pinia'
import type { WhiteboardNode, WhiteboardData } from '@/types'
import {
  DEFAULT_NODE_WIDTH,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_TEXT,
  MIN_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  type PresetStyle,
} from '@/constants'
import { generateId } from '@/utils/id'

/**
 * 白板状态管理 Store
 *
 * 管理多白板、节点 CRUD、选中/编辑状态、导航状态、以及每个节点的样式属性。
 */
export const useWhiteboardStore = defineStore('whiteboard', () => {
  // ── State ──

  /** 全部节点（跨白板）：Map<id, WhiteboardNode> */
  const nodes = shallowRef<Map<string, WhiteboardNode>>(new Map())

  /** 当前选中节点 ID，null 表示无选中 */
  const selectedNodeId = ref<string | null>(null)

  /** 当前正在编辑的节点 ID，null 表示无编辑 */
  const editingNodeId = ref<string | null>(null)

  /** 画布视口 X 偏移 */
  const stageX = ref(0)
  /** 画布视口 Y 偏移 */
  const stageY = ref(0)
  /** 画布缩放倍率 */
  const stageScale = ref(1)
  /** 是否处于平移模式（空格键按下） */
  const isPanMode = ref(false)

  // ── 多白板 ──

  /** 白板列表 */
  const whiteboards = ref<WhiteboardData[]>([
    { id: 'default', name: '白板 1' },
  ])
  /** 当前活跃白板 ID */
  const activeWhiteboardId = ref('default')

  // ── Getters ──

  /** 当前白板的节点数组（用于 v-for 渲染） */
  const nodesArray = computed<WhiteboardNode[]>(() =>
    Array.from(nodes.value.values()).filter(
      (n) => n.whiteboardId === activeWhiteboardId.value,
    ),
  )

  /** 当前选中的节点对象 */
  const selectedNode = computed<WhiteboardNode | null>(() => {
    if (selectedNodeId.value === null) return null
    return nodes.value.get(selectedNodeId.value) ?? null
  })

  /** 当前活跃白板 */
  const activeWhiteboard = computed<WhiteboardData | undefined>(() =>
    whiteboards.value.find((w) => w.id === activeWhiteboardId.value),
  )

  // ── Actions: 白板管理 ──

  function addWhiteboard(name?: string): string {
    const id = generateId()
    whiteboards.value.push({ id, name: name ?? `白板 ${whiteboards.value.length + 1}` })
    return id
  }

  function removeWhiteboard(id: string): void {
    if (whiteboards.value.length <= 1) return
    const idx = whiteboards.value.findIndex((w) => w.id === id)
    if (idx === -1) return
    whiteboards.value.splice(idx, 1)
    // 删除该白板下所有节点
    for (const [nodeId, node] of nodes.value) {
      if (node.whiteboardId === id) nodes.value.delete(nodeId)
    }
    triggerRef(nodes)
    // 切换到第一个白板
    if (activeWhiteboardId.value === id) {
      activeWhiteboardId.value = whiteboards.value[0]!.id
    }
  }

  function switchWhiteboard(id: string): void {
    if (!whiteboards.value.find((w) => w.id === id)) return
    activeWhiteboardId.value = id
    selectedNodeId.value = null
    editingNodeId.value = null
  }

  // ── Actions: 节点 CRUD ──

  function addNode(x: number, y: number, text?: string): string {
    const id = generateId()
    const node: WhiteboardNode = {
      id,
      whiteboardId: activeWhiteboardId.value,
      x,
      y,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      text: text ?? DEFAULT_NODE_TEXT,
    }

    nodes.value.set(id, node)
    triggerRef(nodes)

    selectedNodeId.value = id
    editingNodeId.value = id

    return id
  }

  function deleteNode(id: string): void {
    nodes.value.delete(id)
    triggerRef(nodes)

    if (selectedNodeId.value === id) {
      selectedNodeId.value = null
    }
    if (editingNodeId.value === id) {
      editingNodeId.value = null
    }
  }

  function selectNode(id: string | null): void {
    selectedNodeId.value = id
  }

  function moveNode(id: string, x: number, y: number): void {
    const node = nodes.value.get(id)
    if (!node) return
    node.x = x
    node.y = y
    triggerRef(nodes)
  }

  function resizeNode(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const node = nodes.value.get(id)
    if (!node) return
    node.x = x
    node.y = y
    node.width = Math.max(width, MIN_NODE_WIDTH)
    node.height = Math.max(height, MIN_NODE_HEIGHT)
    triggerRef(nodes)
  }

  // ── Actions: 文本编辑 ──

  function startEditing(id: string): void {
    editingNodeId.value = id
  }

  function stopEditing(): void {
    editingNodeId.value = null
  }

  function setNodeText(id: string, text: string): void {
    const node = nodes.value.get(id)
    if (!node) return
    node.text = text
    triggerRef(nodes)
    editingNodeId.value = null
  }

  // ── Actions: 节点样式 ──

  function setNodeTextColor(id: string, color: string): void {
    const node = nodes.value.get(id)
    if (!node) return
    node.textColor = color
    triggerRef(nodes)
  }

  function setNodeBackgroundColor(id: string, color: string): void {
    const node = nodes.value.get(id)
    if (!node) return
    node.backgroundColor = color
    triggerRef(nodes)
  }

  function setNodeBorderColor(id: string, color: string): void {
    const node = nodes.value.get(id)
    if (!node) return
    node.borderColor = color
    triggerRef(nodes)
  }

  function applyPresetStyle(id: string, preset: PresetStyle): void {
    const node = nodes.value.get(id)
    if (!node) return
    node.backgroundColor = preset.backgroundColor
    node.borderColor = preset.borderColor
    node.textColor = preset.textColor
    triggerRef(nodes)
  }

  function resetNodeStyle(id: string): void {
    const node = nodes.value.get(id)
    if (!node) return
    node.backgroundColor = undefined
    node.borderColor = undefined
    node.textColor = undefined
    triggerRef(nodes)
  }

  return {
    // State
    nodes,
    selectedNodeId,
    editingNodeId,
    stageX,
    stageY,
    stageScale,
    isPanMode,
    whiteboards,
    activeWhiteboardId,
    // Getters
    nodesArray,
    selectedNode,
    activeWhiteboard,
    // Actions
    addWhiteboard,
    removeWhiteboard,
    switchWhiteboard,
    addNode,
    deleteNode,
    selectNode,
    moveNode,
    resizeNode,
    setNodeText,
    startEditing,
    stopEditing,
    setNodeTextColor,
    setNodeBackgroundColor,
    setNodeBorderColor,
    applyPresetStyle,
    resetNodeStyle,
  }
})
