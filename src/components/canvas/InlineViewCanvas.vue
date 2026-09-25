<script setup lang="ts">
/**
 * InlineViewCanvas - 内联视图 DOM 覆盖层，内部渲染独立 CanvasStage。
 * 外层容器按宿主视口缩放摆位，内层 CSS transform:scale 等比缩放——Konva 的
 * setPointersPositions 会按缩放后 getBoundingClientRect 与固定 clientWidth 的比值
 * 归一化指针坐标，故 transform 不影响 getPointerPosition 正确性，composable 无需感知宿主缩放。
 */
import { computed } from 'vue'
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

const node = computed(() => nodeStore.getNode(props.nodeId))
const inlineRect = computed(() => hostView.getInlineViewRect(props.nodeId))

/** 外层容器屏幕位置/尺寸 = 世界坐标 × 宿主缩放 + 宿主偏移 */
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

/** 内嵌 Stage 固定像素尺寸 = 内联视图世界尺寸，缩放由 scalerStyle 承担 */
const canvasWidth = computed(() => inlineRect.value?.width ?? 0)
const canvasHeight = computed(
  () => (inlineRect.value ? inlineRect.value.height - INLINE_VIEW_TITLE_HEIGHT : 0),
)

/** 内层缩放容器：固定世界尺寸 + CSS transform: scale(宿主缩放)，原点左上角对齐 */
const scalerStyle = computed(() => {
  const r = inlineRect.value
  if (!r) return { display: 'none' as const }
  return {
    width: `${r.width}px`,
    height: `${r.height - INLINE_VIEW_TITLE_HEIGHT}px`,
    transform: `scale(${hostView.stageScale})`,
    transformOrigin: 'top left' as const,
  }
})
</script>

<template>
  <div class="inline-view-container" :style="containerStyle">
    <div class="inline-view-scaler" :style="scalerStyle">
      <CanvasStage :view-id="viewId" :width="canvasWidth" :height="canvasHeight" />
    </div>
  </div>
</template>

<style scoped>
.inline-view-container {
  z-index: 10;
}

.inline-view-scaler {
  position: absolute;
  top: 0;
  left: 0;
}
</style>
