<script setup lang="ts">
/**
 * InlineViewFrame - 内联视图宿主框架
 *
 * 当主视图中某节点被"展开"为内联视图时，用本组件替代 WhiteboardNode 渲染：
 * - 标题栏（节点样式 + 节点文本），承担原节点的交互（拖拽移动 / 选中 / 连线起点 / 双击编辑）
 * - 矩形边界（内联视图尺寸），供 Transformer 缩放
 *
 * v-group 的 name 设为节点 ID，使 useNodeDragging / useConnectionCreation 的
 * findNodeIdFromTarget 直接识别，零改动复用现有交互。
 *
 * 矩形内容区域（标题栏下方）被 InlineViewCanvas 的 DOM 覆盖层占据，
 * 标题栏区域不被覆盖，保持主 Stage 可交互。
 */
import { ref, computed } from 'vue'
import type { VueKonvaRef } from 'vue-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useThemeStore } from '@/stores/theme'
import { deriveBackgroundColor } from '@/utils/color'
import {
  DEFAULT_NODE_STYLE,
  INLINE_VIEW_TITLE_HEIGHT,
  PLACEHOLDER_TEXT,
} from '@/constants'

const props = defineProps<{
  nodeId: string
  /** 宿主视图 ID（读内联视图尺寸） */
  viewId: string
}>()

const emit = defineEmits<{
  dblclick: [nodeId: string]
}>()

const nodeStore = useNodeStore()
const view = useViewStore(props.viewId)
const themeStore = useThemeStore()

const rectRef = ref<VueKonvaRef<Konva.Rect> | null>(null)
const groupRef = ref<VueKonvaRef<Konva.Group> | null>(null)

const node = computed(() => nodeStore.getNode(props.nodeId))
const inlineRect = computed(() => view.getInlineViewRect(props.nodeId))

/** v-group 配置（name = 节点 ID，供 findNodeIdFromTarget 识别） */
const groupConfig = {
  name: props.nodeId,
}

/** 矩形边界配置（整个内联视图区域，供 Transformer 附着 + 视觉边框） */
const borderRectConfig = computed(() => {
  const n = node.value
  const r = inlineRect.value
  if (!n || !r) return {}
  return {
    width: r.width,
    height: r.height,
    fill: deriveBackgroundColor(n.borderColor ?? DEFAULT_NODE_STYLE.borderColor, themeStore.isDark),
    stroke: n.borderColor ?? DEFAULT_NODE_STYLE.borderColor,
    strokeWidth: DEFAULT_NODE_STYLE.borderWidth,
    strokeScaleEnabled: false,
  }
})

/** 标题栏背景配置 */
const titleBarConfig = computed(() => {
  const n = node.value
  const r = inlineRect.value
  if (!n || !r) return {}
  return {
    width: r.width,
    height: INLINE_VIEW_TITLE_HEIGHT,
    fill: n.borderColor ?? DEFAULT_NODE_STYLE.borderColor,
  }
})

/** 标题栏文本配置 */
const titleTextConfig = computed(() => {
  const n = node.value
  const r = inlineRect.value
  if (!n || !r) return {}
  return {
    text: n.text || PLACEHOLDER_TEXT,
    width: r.width,
    height: INLINE_VIEW_TITLE_HEIGHT,
    align: 'left' as const,
    verticalAlign: 'middle' as const,
    fontSize: 14,
    fontStyle: 'bold',
    fontFamily: DEFAULT_NODE_STYLE.fontFamily,
    fill: '#ffffff',
    padding: 8,
  }
})

/** 双击标题栏 -> 开始编辑节点文本 */
function onDblClick(e: KonvaEventObject<MouseEvent>): void {
  if (e.evt.button !== 0) return
  emit('dblclick', props.nodeId)
}

defineExpose({
  /** 返回矩形边界 Konva.Rect，供父组件全局 Transformer 附着 */
  getRectNode: () => rectRef.value?.getNode() ?? null,
  /** 返回 Konva.Group，供父组件调整层级（选中置顶） */
  getGroupNode: () => groupRef.value?.getNode() ?? null,
})
</script>

<template>
  <v-group
    ref="groupRef"
    :config="groupConfig"
    :x="node?.x"
    :y="node?.y"
    @dblclick="onDblClick"
  >
    <!-- 矩形边界（整个内联视图区域，供 Transformer 附着 + 视觉边框） -->
    <v-rect ref="rectRef" :config="borderRectConfig" />
    <!-- 标题栏背景 -->
    <v-rect :config="titleBarConfig" />
    <!-- 标题栏文本 -->
    <v-text :config="titleTextConfig" />
  </v-group>
</template>
