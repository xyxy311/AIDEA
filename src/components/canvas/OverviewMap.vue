<script setup lang="ts">
/**
 * OverviewMap — 右下角导航小地图
 *
 * 以缩略图形式展示所有节点的空间分布，并用矩形框标注当前视口范围。
 *
 * 交互：
 * - 点击小地图空白区域 → 缩放并平移，使所有节点适应视口
 * - 拖拽蓝色视口框 → 平移画布（保持缩放不变）
 */
import { computed, ref, onUnmounted } from 'vue'
import { useActiveView } from '@/composables/useActiveView'
import { useStageSize } from '@/composables/useStageSize'
import { DEFAULT_NODE_STYLE, MIN_SCALE, MAX_SCALE, ZOOM_STEP } from '@/constants'

// ── 小地图尺寸 ──
const MAP_WIDTH = 200
const MAP_HEIGHT = 140
const MAP_PADDING = 0.15

const active = useActiveView()
const { stageWidth, stageHeight } = useStageSize()

// ── 当前视图的节点列表 ──
const nodes = computed(() => active.nodeStore.childrenOf(active.project.currentNodeId))
const mapRef = ref<HTMLDivElement | null>(null)

// ── 拖拽状态 ──
const isDragging = ref(false)
let dragStartMouseX = 0
let dragStartMouseY = 0
let dragStartStageX = 0
let dragStartStageY = 0

// ── 当前视口的世界坐标边界 ──

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const worldViewport = computed<Rect>(() => {
  const s = active.view.stageScale
  return {
    x: -active.view.stageX / s,
    y: -active.view.stageY / s,
    width: stageWidth.value / s,
    height: stageHeight.value / s,
  }
})

// ── 世界包围盒（所有节点 + 视口 + padding） ──

const worldBounds = computed<Rect>(() => {
  const vp = worldViewport.value
  let minX = vp.x
  let minY = vp.y
  let maxX = vp.x + vp.width
  let maxY = vp.y + vp.height

  for (const node of nodes.value) {
    if (node.x < minX) minX = node.x
    if (node.y < minY) minY = node.y
    if (node.x + node.width > maxX) maxX = node.x + node.width
    if (node.y + node.height > maxY) maxY = node.y + node.height
  }

  // 避免无节点时退化
  const minWorldW = vp.width * 2
  const minWorldH = vp.height * 2
  const w = maxX - minX
  const h = maxY - minY
  if (w < minWorldW) {
    const mid = (minX + maxX) / 2
    minX = mid - minWorldW / 2
    maxX = mid + minWorldW / 2
  }
  if (h < minWorldH) {
    const mid = (minY + maxY) / 2
    minY = mid - minWorldH / 2
    maxY = mid + minWorldH / 2
  }

  const paddedW = maxX - minX
  const paddedH = maxY - minY
  minX -= paddedW * MAP_PADDING
  minY -= paddedH * MAP_PADDING
  maxX += paddedW * MAP_PADDING
  maxY += paddedH * MAP_PADDING

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
})

// ── 世界 → 小地图像素 ──


function toMapX(wx: number): number {
  const b = worldBounds.value
  return ((wx - b.x) / b.width) * MAP_WIDTH
}
function toMapY(wy: number): number {
  const b = worldBounds.value
  return ((wy - b.y) / b.height) * MAP_HEIGHT
}
function toMapW(ww: number): number {
  return (ww / worldBounds.value.width) * MAP_WIDTH
}
function toMapH(wh: number): number {
  return (wh / worldBounds.value.height) * MAP_HEIGHT
}

// ── 视口矩形样式 ──

const viewportStyle = computed(() => {
  const vp = worldViewport.value
  return {
    left: `${toMapX(vp.x)}px`,
    top: `${toMapY(vp.y)}px`,
    width: `${toMapW(vp.width)}px`,
    height: `${toMapH(vp.height)}px`,
  }
})

// ── 节点缩略 ──

const mapNodes = computed(() =>
  nodes.value.map((node) => ({
    id: node.id,
    style: {
      left: `${toMapX(node.x)}px`,
      top: `${toMapY(node.y)}px`,
      width: `${toMapW(node.width)}px`,
      height: `${toMapH(node.height)}px`,
      backgroundColor: DEFAULT_NODE_STYLE.backgroundColor,
    },
  })),
)

// ── 点击小地图 → 适应全部节点 ──

function handleMapClick(e: MouseEvent): void {
  // 拖拽期间不响应点击
  if (isDragging.value) return
  // 点击在视口框上不处理（由拖拽处理）
  if ((e.target as HTMLElement).classList.contains('overview-viewport')) return

  fitAllNodes()
}

/** 缩放并平移视口以适应所有节点 */
function fitAllNodes(): void {
  const allNodes = nodes.value
  if (allNodes.length === 0) return

  // 计算节点包围盒
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of allNodes) {
    if (node.x < minX) minX = node.x
    if (node.y < minY) minY = node.y
    if (node.x + node.width > maxX) maxX = node.x + node.width
    if (node.y + node.height > maxY) maxY = node.y + node.height
  }

  // 加 padding
  const padding = 0.12
  const w = maxX - minX
  const h = maxY - minY
  minX -= w * padding
  minY -= h * padding
  maxX += w * padding
  maxY += h * padding

  // 计算适应视口的缩放倍率
  const totalW = maxX - minX
  const totalH = maxY - minY
  const scaleX = stageWidth.value / totalW
  const scaleY = stageHeight.value / totalH
  const newScale = Math.min(scaleX, scaleY)

  // 约束在允许范围内
  const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale))

  // 居中
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  active.view.stageScale = clampedScale
  active.view.stageX = stageWidth.value / 2 - centerX * clampedScale
  active.view.stageY = stageHeight.value / 2 - centerY * clampedScale
}

// ── 拖拽视口框 → 平移画布 ──

function handleViewportMouseDown(e: MouseEvent): void {
  e.stopPropagation()
  isDragging.value = true
  dragStartMouseX = e.clientX
  dragStartMouseY = e.clientY
  dragStartStageX = active.view.stageX
  dragStartStageY = active.view.stageY

  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
}

function handleDragMove(e: MouseEvent): void {
  if (!isDragging.value) return

  const dx = e.clientX - dragStartMouseX
  const dy = e.clientY - dragStartMouseY

  // 小地图像素增量 → 世界坐标增量
  const b = worldBounds.value
  const worldDx = (dx / MAP_WIDTH) * b.width
  const worldDy = (dy / MAP_HEIGHT) * b.height

  active.view.stageX = dragStartStageX - worldDx * active.view.stageScale
  active.view.stageY = dragStartStageY - worldDy * active.view.stageScale
}

function handleDragEnd(): void {
  isDragging.value = false
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
}

// ── 滚轮缩放（以小地图位置为锚点） ──

function handleWheel(e: WheelEvent): void {
  e.preventDefault()

  const oldScale = active.view.stageScale
  const direction = e.deltaY > 0 ? -1 : 1
  const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * factor))

  if (newScale === oldScale) return

  // 以当前视口中心为锚点缩放（即缩放时视口中心对应世界坐标不变）
  const vpCenterX = stageWidth.value / 2
  const vpCenterY = stageHeight.value / 2
  const worldCenterX = (vpCenterX - active.view.stageX) / oldScale
  const worldCenterY = (vpCenterY - active.view.stageY) / oldScale

  active.view.stageScale = newScale
  active.view.stageX = vpCenterX - worldCenterX * newScale
  active.view.stageY = vpCenterY - worldCenterY * newScale
}

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
})
</script>

<template>
  <div ref="mapRef" class="overview-map" @click="handleMapClick" @wheel.prevent="handleWheel">
    <!-- 节点缩略（在下层） -->
    <div
      v-for="node in mapNodes"
      :key="node.id"
      class="overview-node"
      :style="node.style"
    />
    <!-- 视口框（在上层，可拖拽） -->
    <div
      class="overview-viewport"
      :class="{ dragging: isDragging }"
      :style="viewportStyle"
      @mousedown="handleViewportMouseDown"
    />
  </div>
</template>

<style scoped>
.overview-map {
  position: absolute;
  right: 12px;
  bottom: 12px;
  width: 200px;
  height: 140px;
  background: rgba(30, 30, 30, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  z-index: 500;
  backdrop-filter: blur(2px);
}

.overview-viewport {
  position: absolute;
  border: 1.5px solid #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 2px;
  z-index: 2;
  cursor: grab;
  transition: background 0.15s;
}

.overview-viewport:hover {
  background: rgba(59, 130, 246, 0.2);
}

.overview-viewport.dragging {
  cursor: grabbing;
  background: rgba(59, 130, 246, 0.25);
}

.overview-node {
  position: absolute;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 1px;
  pointer-events: none;
  z-index: 1;
  min-width: 3px;
  min-height: 2px;
}
</style>
