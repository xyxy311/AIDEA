<script setup lang="ts">
/**
 * InlineViewCanvas - 内联视图 DOM 覆盖层
 *
 * 绝对定位的 DOM 容器，内部渲染独立的 CanvasStage（内联视图本体）。
 * 容器位置/尺寸跟随宿主视图的矩形（世界坐标 -> 屏幕坐标）实时同步：
 * 当主视口平移/缩放时，本容器随之移动/缩放，保持与主 Stage 上的矩形对齐。
 *
 * 容器覆盖矩形内容区（标题栏下方），标题栏区域不被覆盖（保持主 Stage 可交互）。
 * 内联视图拥有完整独立的交互栈（per-view CanvasStage），与主视图无事件串扰。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { INLINE_VIEW_TITLE_HEIGHT } from '@/constants'
import CanvasStage from './CanvasStage.vue'

const props = defineProps<{
  /** 内联视图实例 ID */
  viewId: string
  /** 宿主视图 ID（读矩形位置/尺寸 + 同步主视口） */
  hostViewId: string
  /** 被展开的节点 ID */
  nodeId: string
}>()

const nodeStore = useNodeStore()
const hostView = useViewStore(props.hostViewId)

const containerRef = ref<HTMLDivElement | null>(null)
/** 容器实际像素尺寸（供内嵌 CanvasStage 使用，替代 window 尺寸） */
const containerWidth = ref(0)
const containerHeight = ref(0)

const node = computed(() => nodeStore.getNode(props.nodeId))
const inlineRect = computed(() => hostView.getInlineViewRect(props.nodeId))

/**
 * 容器屏幕位置/尺寸（跟随宿主视口平移缩放）
 * 屏幕坐标 = 世界坐标 × 宿主缩放 + 宿主偏移
 */
const containerStyle = computed(() => {
  const n = node.value
  const r = inlineRect.value
  if (!n || !r) return { display: 'none' as const }
  const s = hostView.stageScale
  return {
    position: 'absolute' as const,
    left: `${n.x * s + hostView.stageX}px`,
    top: `${(n.y + INLINE_VIEW_TITLE_HEIGHT) * s + hostView.stageY}px`,
    width: `${r.width * s}px`,
    height: `${(r.height - INLINE_VIEW_TITLE_HEIGHT) * s}px`,
    overflow: 'hidden' as const,
    pointerEvents: 'auto' as const,
  }
})

// 测量容器实际尺寸传给 CanvasStage（内联视图的 Stage 用容器尺寸，而非 window）
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (containerRef.value) {
    containerWidth.value = containerRef.value.clientWidth
    containerHeight.value = containerRef.value.clientHeight
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width
        containerHeight.value = entry.contentRect.height
      }
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <div ref="containerRef" class="inline-view-container" :style="containerStyle">
    <CanvasStage
      :view-id="viewId"
      :width="containerWidth"
      :height="containerHeight"
    />
  </div>
</template>

<style scoped>
.inline-view-container {
  z-index: 10;
}
</style>
