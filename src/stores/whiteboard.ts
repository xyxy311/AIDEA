import { ref, computed, shallowRef, triggerRef } from 'vue'
import { defineStore } from 'pinia'
import type { WhiteboardNode } from '@/types'
import { useProjectStore } from '@/stores/project'
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
 * 白板 Store 工厂 — 每个白板拥有独立的 store 实例
 *
 * 使用 `useWhiteboardStore(id)` 获取指定白板的 store。
 * 同一 id 多次调用返回同一实例（Pinia 自动管理）。
 *
 * 每个实例管理：
 *   - 该白板的所有节点（CRUD + 样式）
 *   - 选中/编辑状态
 *   - 导航状态（平移 + 缩放）
 */
export function useWhiteboardStore(id: string) {
  const storeId = `whiteboard-${id}`

  return defineStore(storeId, () => {
    // ── State ──

    /** 所属白板 ID（冗余存储，方便调试） */
    const whiteboardId = id

    /** 节点存储：Map<id, WhiteboardNode> */
    const nodes = shallowRef<Map<string, WhiteboardNode>>(new Map())

    /** 当前选中节点 ID */
    const selectedNodeId = ref<string | null>(null)

    /** 当前正在编辑的节点 ID */
    const editingNodeId = ref<string | null>(null)

    /** 画布视口 X 偏移 */
    const stageX = ref(0)
    /** 画布视口 Y 偏移 */
    const stageY = ref(0)
    /** 画布缩放倍率 */
    const stageScale = ref(1)
    /** 是否处于平移模式 */
    const isPanMode = ref(false)

    // ── Getters ──

    /** 当前白板的所有节点 */
    const nodesArray = computed<WhiteboardNode[]>(() =>
      Array.from(nodes.value.values()),
    )

  /** 当前选中的节点对象 */
  const selectedNode = computed<WhiteboardNode | null>(() => {
    if (selectedNodeId.value === null) return null
    const n = nodes.value.get(selectedNodeId.value)
    // 必须展开为新对象——shallowRef<Map> 配合 triggerRef 时
    // Map 中对象引用不变，computed 按 === 比较会跳过下游通知
    return n ? { ...n } : null
  })

  /**
   * 白板名称——从项目 store 中读取，保持单一数据源。
   * 当项目 store 的 renameWhiteboard 更新名称时，此计算属性自动同步。
   */
  const name = computed(() => {
    const project = useProjectStore()
    return project.whiteboards.find((w) => w.id === whiteboardId)?.name ?? '白板'
  })

    // ── Actions: 节点 CRUD ──

    function addNode(x: number, y: number, text?: string): string {
      const nodeId = generateId()
      const node: WhiteboardNode = {
        id: nodeId,
        whiteboardId,
        x,
        y,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        text: text ?? DEFAULT_NODE_TEXT,
      }

      nodes.value.set(nodeId, node)
      triggerRef(nodes)

      selectedNodeId.value = nodeId
      editingNodeId.value = nodeId

      return nodeId
    }

    function deleteNode(nodeId: string): void {
      nodes.value.delete(nodeId)
      triggerRef(nodes)

      if (selectedNodeId.value === nodeId) {
        selectedNodeId.value = null
      }
      if (editingNodeId.value === nodeId) {
        editingNodeId.value = null
      }
    }

    function selectNode(nodeId: string | null): void {
      selectedNodeId.value = nodeId
    }

    function moveNode(nodeId: string, x: number, y: number): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.x = x
      node.y = y
      triggerRef(nodes)
    }

    function resizeNode(
      nodeId: string,
      x: number,
      y: number,
      width: number,
      height: number,
    ): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.x = x
      node.y = y
      node.width = Math.max(width, MIN_NODE_WIDTH)
      node.height = Math.max(height, MIN_NODE_HEIGHT)
      triggerRef(nodes)
    }

    // ── Actions: 文本编辑 ──

    function startEditing(nodeId: string): void {
      editingNodeId.value = nodeId
    }

    function stopEditing(): void {
      editingNodeId.value = null
    }

    function setNodeText(nodeId: string, text: string): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.text = text
      triggerRef(nodes)
      editingNodeId.value = null
    }

    /**
     * 更新节点文本（不改变编辑状态）
     * 供侧边栏属性编辑器使用，与画布内联编辑器（setNodeText）区分。
     */
    function updateNodeText(nodeId: string, text: string): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.text = text
      triggerRef(nodes)
    }

    // ── Actions: 节点样式 ──

    function setNodeTextColor(nodeId: string, color: string): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.textColor = color
      triggerRef(nodes)
    }

    function setNodeBackgroundColor(nodeId: string, color: string): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.backgroundColor = color
      triggerRef(nodes)
    }

    function setNodeBorderColor(nodeId: string, color: string): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.borderColor = color
      triggerRef(nodes)
    }

    function applyPresetStyle(nodeId: string, preset: PresetStyle): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.backgroundColor = preset.backgroundColor
      node.borderColor = preset.borderColor
      node.textColor = preset.textColor
      triggerRef(nodes)
    }

    function resetNodeStyle(nodeId: string): void {
      const node = nodes.value.get(nodeId)
      if (!node) return
      node.backgroundColor = undefined
      node.borderColor = undefined
      node.textColor = undefined
      triggerRef(nodes)
    }

    // ── Actions: 状态重置 ──

    /**
     * 重置白板交互状态（切换白板时调用）
     *
     * 当前仅清除选中和编辑状态，后续可扩展（如重置视口位置等）。
     */
    function resetBoardState(): void {
      selectedNodeId.value = null
      editingNodeId.value = null
    }

    return {
      // State
      whiteboardId,
      nodes,
      selectedNodeId,
      editingNodeId,
      stageX,
      stageY,
      stageScale,
      isPanMode,
      // Getters
      nodesArray,
      selectedNode,
      name,
      // Actions
      addNode,
      deleteNode,
      selectNode,
      moveNode,
      resizeNode,
      setNodeText,
      updateNodeText,
      startEditing,
      stopEditing,
      setNodeTextColor,
      setNodeBackgroundColor,
      setNodeBorderColor,
      applyPresetStyle,
      resetNodeStyle,
      resetBoardState,
    }
  })()
}
