<script setup lang="ts">
/**
 * WhiteboardNode - 白板节点组件
 *
 * 单个可调整大小的白板节点，使用 vue-konva 的 v-group + v-rect + v-text 组合渲染。
 *
 * 交互：
 * - 选中与拖动由 canvas 层的 useNodeDragging 统一处理
 * - 双击 → 开始文本编辑（emit dblclick）
 * - Transformer → 调整大小（transformend 时同步尺寸到 store）
 */
import { ref, computed } from 'vue'
import type { VueKonvaRef } from 'vue-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useActiveView } from '@/composables/useActiveView'
import {
  DEFAULT_NODE_STYLE,
  NODE_PADDING,
  NODE_LINE_HEIGHT,
  PLACEHOLDER_TEXT,
  PLACEHOLDER_TEXT_COLOR,
} from '@/constants'

// ── Props ──
const props = defineProps<{
  nodeId: string
  isSelected: boolean
}>()

// ── Emits ──
const emit = defineEmits<{
  dblclick: [nodeId: string]
}>()

// ── Store ──
const active = useActiveView()

// ── Refs ──
const rectRef = ref<VueKonvaRef<Konva.Rect> | null>(null)
/** 节点组引用（供父组件选中时调用 moveToTop 调整层级） */
const groupRef = ref<VueKonvaRef<Konva.Group> | null>(null)

// ── Computed: 从 reactive Map 直接获取节点代理 ──
// reactive Map 的 get 返回 reactive 代理，属性变化自动触发下游 computed
const node = computed(() => active.nodeStore.getNode(props.nodeId))

// ── Konva 节点配置 ──

/** 节点组的拖拽配置 */
const groupConfig = {
  name: props.nodeId,
}

/** 节点背景矩形配置 */
const rectConfig = computed(() => {
  const n = node.value
  if (!n) return {}
  return {
    width: n.width,
    height: n.height,
    // 优先使用节点自定义样式，未设置则回退到全局默认
    fill: n.backgroundColor ?? DEFAULT_NODE_STYLE.backgroundColor,
    stroke: n.borderColor ?? DEFAULT_NODE_STYLE.borderColor,
    strokeWidth: DEFAULT_NODE_STYLE.borderWidth,
    // 禁止 stroke 随 scaleX/scaleY 缩放，缩放过程中边框线宽保持恒定
    strokeScaleEnabled: false,
    cornerRadius: DEFAULT_NODE_STYLE.borderRadius,
    shadowColor: DEFAULT_NODE_STYLE.shadowEnabled
      ? DEFAULT_NODE_STYLE.shadowColor
      : undefined,
    shadowBlur: DEFAULT_NODE_STYLE.shadowEnabled
      ? DEFAULT_NODE_STYLE.shadowBlur
      : 0,
    shadowOffsetX: DEFAULT_NODE_STYLE.shadowEnabled
      ? DEFAULT_NODE_STYLE.shadowOffsetX
      : 0,
    shadowOffsetY: DEFAULT_NODE_STYLE.shadowEnabled
      ? DEFAULT_NODE_STYLE.shadowOffsetY
      : 0,
  }
})

/** 节点文本配置 */
const textConfig = computed(() => {
  const n = node.value
  if (!n) return {}
  const displayText: string = n.text || PLACEHOLDER_TEXT
  const isPlaceholder: boolean = !n.text

  return {
    text: displayText,
    width: n.width,
    height: n.height,
    align: 'center' as const,
    verticalAlign: 'middle' as const,
    fontSize: DEFAULT_NODE_STYLE.fontSize,
    fontFamily: DEFAULT_NODE_STYLE.fontFamily,
    lineHeight: NODE_LINE_HEIGHT,
    // 按字符换行，确保中文也能正确断行
    wrap: 'char' as const,
    // 节点自定义字体颜色 > 全局默认；占位符用灰色
    fill: n.textColor
      ? n.textColor
      : isPlaceholder
        ? PLACEHOLDER_TEXT_COLOR
        : DEFAULT_NODE_STYLE.textColor,
    padding: NODE_PADDING,
  }
})


// ── 事件处理 ──

/** 双击开始编辑（仅响应左键；右键双击留给 contextmenu，避免误进入文字编辑） */
function onDblClick(e: KonvaEventObject<MouseEvent>): void {
  if (e.evt.button !== 0) return
  emit('dblclick', props.nodeId)
}

defineExpose({
  /** 返回底层 Konva.Rect 实例，供父组件全局 Transformer 附着 */
  getRectNode: () => rectRef.value?.getNode() ?? null,
  /** 返回底层 Konva.Group 实例，供父组件调整层级（选中置顶） */
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
    <v-rect ref="rectRef" :config="rectConfig" />
    <v-text :config="textConfig" />
  </v-group>
</template>
