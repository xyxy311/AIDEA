<script setup lang="ts">
/**
 * InlineViewCanvas - 内联视图 DOM 覆盖层
 *
 * 绝对定位的 DOM 容器，内部渲染独立的 CanvasStage（内联视图本体）。
 *
 * 渲染分层（主视口缩放的传递，是本组件的核心）：
 * - 外层 .inline-view-container：屏幕位置/尺寸 = 内联视图世界矩形 × 宿主缩放 + 宿主偏移，
 *   overflow:hidden 裁剪超出内容区的部分，仅负责"将容器摆到主视口的正确屏幕位置"。
 * - 内层 .inline-view-scaler：固定世界尺寸 + CSS transform: scale(宿主缩放)，
 *   使内嵌 Stage 内容随主视口等比缩放。Stage 的 canvas 像素尺寸始终为世界尺寸（固定），
 *   Stage 内部视口（stageX/Y/Scale）保持为内联视图独立值，不受主视口缩放干扰。
 *
 * 为何用 CSS transform 而非修改 Stage scale/x：
 *   Konva setPointersPositions 内部按 content.getBoundingClientRect()（受 transform 影响）
 *   与 content.clientWidth（不受影响）的比值自动归一化指针坐标，因此 CSS transform 不会
 *   影响 getPointerPosition() 的正确性，所有 composable 的坐标转换（基于 view.stageX/
 *   stageScale）无需感知宿主缩放。NodeTextEditor 基于 canvas 坐标 absolute 定位，随
 *   scaler 等比缩放后与节点保持对齐；ContextMenu 经 Teleport 渲染到 body，不受影响。
 *
 * 容器覆盖矩形内容区（标题栏下方），标题栏区域不被覆盖（保持主 Stage 可交互）。
 * 内联视图拥有完整独立的交互栈（per-view CanvasStage），与主视图无事件串扰。
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

/**
 * 外层容器屏幕位置/尺寸（跟随宿主视口平移缩放）
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

/**
 * 内嵌 CanvasStage 的固定像素尺寸（= 内联视图世界尺寸，不随主视口缩放变化）。
 * 主视口缩放由下方 scalerStyle 的 CSS transform: scale 承担。
 */
const canvasWidth = computed(() => inlineRect.value?.width ?? 0)
const canvasHeight = computed(
  () => (inlineRect.value ? inlineRect.value.height - INLINE_VIEW_TITLE_HEIGHT : 0),
)

/**
 * 内层缩放容器样式：固定世界尺寸 + CSS transform: scale(宿主缩放)。
 * transformOrigin: top left 确保缩放原点与容器左上角对齐。
 */
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
