import { ref, computed, shallowRef, triggerRef } from 'vue'
import { defineStore } from 'pinia'
import type { WhiteboardNode } from '@/types'
import {
  DEFAULT_NODE_WIDTH,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_TEXT,
  MIN_NODE_WIDTH,
  MIN_NODE_HEIGHT,
} from '@/constants'
import { generateId } from '@/utils/id'

/**
 * 白板状态管理 Store
 *
 * 使用 shallowRef<Map> 存储节点以提高性能：
 * - Map 提供 O(1) 的增删查操作
 * - shallowRef 避免深度响应式遍历，通过 triggerRef 手动触发更新
 * - 适合频繁的节点位置更新场景
 */
export const useWhiteboardStore = defineStore('whiteboard', () => {
  // ── State ──
  /** 节点存储：Map<id, WhiteboardNode>，使用 shallowRef 优化性能 */
  const nodes = shallowRef<Map<string, WhiteboardNode>>(new Map())

  /** 当前选中节点 ID，null 表示无选中 */
  const selectedNodeId = ref<string | null>(null)

  /** 画布视口 X 偏移（平移） */
  const stageX = ref(0)

  /** 画布视口 Y 偏移（平移） */
  const stageY = ref(0)

  /** 画布缩放倍率 */
  const stageScale = ref(1)

  /** 是否处于平移模式（空格键按下） */
  const isPanMode = ref(false)

  // ── Getters ──
  /** 节点数组（用于 v-for 渲染） */
  const nodesArray = computed<WhiteboardNode[]>(() =>
    Array.from(nodes.value.values()),
  )

  /** 当前选中的节点对象，无选中时返回 null */
  const selectedNode = computed<WhiteboardNode | null>(() => {
    if (selectedNodeId.value === null) return null
    return nodes.value.get(selectedNodeId.value) ?? null
  })

  // ── Actions ──

  /**
   * 在指定位置创建新节点
   * @param x - 节点 x 坐标
   * @param y - 节点 y 坐标
   * @param text - 节点文本（可选，默认使用 DEFAULT_NODE_TEXT）
   * @returns 新节点的唯一 ID
   */
  function addNode(x: number, y: number, text?: string): string {
    const id = generateId()
    const node: WhiteboardNode = {
      id,
      x,
      y,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      text: text ?? DEFAULT_NODE_TEXT,
    }

    nodes.value.set(id, node)
    triggerRef(nodes)

    // 新节点自动选中
    selectedNodeId.value = id

    return id
  }

  /**
   * 删除指定节点
   * 若该节点处于选中状态，则同时清除选中
   * @param id - 要删除的节点 ID
   */
  function deleteNode(id: string): void {
    nodes.value.delete(id)
    triggerRef(nodes)

    // 若删除的是当前选中节点，清除选中状态
    if (selectedNodeId.value === id) {
      selectedNodeId.value = null
    }
  }

  /**
   * 选中或取消选中节点
   * @param id - 节点 ID，传 null 取消选中
   */
  function selectNode(id: string | null): void {
    selectedNodeId.value = id
  }

  /**
   * 移动节点到新位置
   * @param id - 节点 ID
   * @param x - 新的 x 坐标
   * @param y - 新的 y 坐标
   */
  function moveNode(id: string, x: number, y: number): void {
    const node = nodes.value.get(id)
    if (!node) return

    node.x = x
    node.y = y
    triggerRef(nodes)
  }

  /**
   * 调整节点尺寸（用于 Transformer 和 缩放操作）
   * 自动应用最小尺寸约束
   * @param id - 节点 ID
   * @param x - 新的 x 坐标
   * @param y - 新的 y 坐标
   * @param width - 新的宽度
   * @param height - 新的高度
   */
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

  /**
   * 设置节点文本内容（用于内联编辑保存）
   * @param id - 节点 ID
   * @param text - 新的文本内容（允许空字符串）
   */
  function setNodeText(id: string, text: string): void {
    const node = nodes.value.get(id)
    if (!node) return

    node.text = text
    triggerRef(nodes)
  }

  return {
    // State
    nodes,
    selectedNodeId,
    stageX,  // 画布偏移量（相对于视图）
    stageY,
    stageScale,
    isPanMode,
    // Getters
    nodesArray,
    selectedNode,
    // Actions
    addNode,
    deleteNode,
    selectNode,
    moveNode,
    resizeNode,
    setNodeText,
  }
})
