<script setup lang="ts">
/**
 * InlineViewFrame - 内联视图宿主框架：节点被展开为内联视图时替代 WhiteboardNode 渲染。
 * 标题栏（节点样式 + 节点文本）承担原节点交互，矩形边界供 Transformer 缩放；
 * v-group name 设为节点 ID，供 findNodeIdFromTarget 零改动识别复用现有交互。
 */
import { ref, computed } from 'vue'
import type { VueKonvaRef } from 'vue-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useNodeStore } from '@/stores/node'
import { useViewStore } from '@/stores/view'
import { useThemeStore } from '@/stores/theme'
import { t } from '@/composables/useT'
import { deriveBackgroundColor } from '@/utils/color'
import {
  DEFAULT_NODE_STYLE,
  INLINE_VIEW_TITLE_HEIGHT,
  PLACEHOLDER_TEXT_KEY,
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
    // 空文本占位文案经 t() 实时翻译（computed 内，切语言热更新）
    text: n.text || t(PLACEHOLDER_TEXT_KEY),
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
  getRectNode: () => rectRef.value?.getNode() ?? null,
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
