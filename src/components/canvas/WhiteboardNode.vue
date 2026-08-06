<script setup lang="ts">
/**
 * WhiteboardNode - 白板节点组件
 *
 * 单个可调整大小的白板节点，使用 vue-konva 的 v-group + v-rect + 多片段 v-text 组合渲染。
 *
 * 文本渲染：将节点文本解析为多行多片段（`@引用` 片段高亮、下划线、可点击跳转），
 * 普通文本片段 `listening:false` 不拦截节点拖动/选中。
 *
 * 交互：
 * - 选中与拖动由 canvas 层的 useNodeDragging 统一处理
 * - 双击 → 开始文本编辑（emit dblclick）
 * - 点击引用片段 → 跳转到被引用节点（emit referenceClick）
 * - Transformer → 调整大小（transformend 时同步尺寸到 store）
 */
import { ref, computed } from 'vue'
import type { VueKonvaRef } from 'vue-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useNodeStore } from '@/stores/node'
import { useThemeStore } from '@/stores/theme'
import { deriveBackgroundColor } from '@/utils/color'
import {
  parseReferenceSegments,
  layoutReferenceText,
  type Segment,
} from '@/utils/reference'
import { measureLineWidth } from '@/utils/geometry'
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
}>()

// ── Emits ──
const emit = defineEmits<{
  dblclick: [nodeId: string]
  /** 点击引用片段时触发，携带被引用节点 ID（由 CanvasStage 处理跳转） */
  referenceClick: [targetNodeId: string]
}>()

// ── Store ──
const nodeStore = useNodeStore()
const themeStore = useThemeStore()

// ── Refs ──
const rectRef = ref<VueKonvaRef<Konva.Rect> | null>(null)
/** 节点组引用（供父组件选中时调用 moveToTop 调整层级） */
const groupRef = ref<VueKonvaRef<Konva.Group> | null>(null)

// ── Computed: 从 reactive Map 直接获取节点代理 ──
// reactive Map 的 get 返回 reactive 代理，属性变化自动触发下游 computed
const node = computed(() => nodeStore.getNode(props.nodeId))

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
    // 背景色由边框色派生（保持色相、继承透明度，随主题明暗）
    fill: deriveBackgroundColor(n.borderColor ?? DEFAULT_NODE_STYLE.borderColor, themeStore.isDark),
    stroke: n.borderColor ?? DEFAULT_NODE_STYLE.borderColor,
    strokeWidth: DEFAULT_NODE_STYLE.borderWidth,
    // 禁止 stroke 随 scaleX/scaleY 缩放，缩放过程中边框线宽保持恒定
    strokeScaleEnabled: false,
    cornerRadius: DEFAULT_NODE_STYLE.borderRadius,
  }
})

/**
 * 文本布局：把节点文本解析并布局为多行多片段，叠加 padding 与垂直居中偏移，
 * 产出可直接给 v-text 用的绝对坐标（相对 group）。
 *
 * 每行内片段 x 由"行起点 + 该片段前所有片段宽度之和"累加计算。
 */
const layoutLines = computed(() => {
  const n = node.value
  if (!n) return []
  const isPlaceholder = !n.text
  // 占位符不解析引用（整体作为普通文本）
  const paragraphs = isPlaceholder
    ? [[{ type: 'text' as const, text: PLACEHOLDER_TEXT }]]
    : parseReferenceSegments(n.text)
  const contentWidth = n.width - NODE_PADDING * 2
  const fontSize = DEFAULT_NODE_STYLE.fontSize
  const fontFamily = DEFAULT_NODE_STYLE.fontFamily
  const lines = layoutReferenceText(paragraphs, contentWidth, fontSize, fontFamily, NODE_LINE_HEIGHT)
  // 垂直居中：总高度，起始 y = (nodeHeight - totalHeight)/2（至少留 padding）
  const totalHeight = lines.length * (fontSize * NODE_LINE_HEIGHT)
  const offsetY = Math.max(NODE_PADDING, (n.height - totalHeight) / 2)
  // 为每个片段计算绝对 x（行起点 + 行内累加宽度）
  return lines.map((line) => {
    let cursorX = NODE_PADDING + line.x
    const segments = line.segments.map((seg) => {
      const segWidth = measureLineWidth(seg.text, fontSize, fontFamily)
      const segX = cursorX
      cursorX += segWidth
      return { seg, x: segX }
    })
    return { segments, y: offsetY + line.y }
  })
})

/** 引用片段颜色：读主题主色（响应式，随主题/主色切换），回退绿色 */
const refColor = computed(
  () => themeStore.scheme.cssVars['--color-primary'] ?? '#10b981',
)

/** 单个片段的 Konva.Text 配置 */
function buildSegConfig(item: { seg: Segment; x: number }, y: number) {
  const fontSize = DEFAULT_NODE_STYLE.fontSize
  const fontFamily = DEFAULT_NODE_STYLE.fontFamily
  const isPlaceholder = !node.value?.text
  const isRef = item.seg.type === 'ref'
  return {
    text: item.seg.text,
    x: item.x,
    y,
    fontSize,
    fontFamily,
    lineHeight: NODE_LINE_HEIGHT,
    // 单片段不换行（布局已拆好），禁用 wrap 避免重复换行
    wrap: 'none' as const,
    fill: isPlaceholder
      ? PLACEHOLDER_TEXT_COLOR
      : isRef
        ? refColor.value
        : themeStore.scheme.canvas.nodeTextColor,
    // 引用片段加下划线（Konva Text 支持 textDecoration）
    textDecoration: isRef ? ('underline' as const) : ('none' as const),
    // 仅引用片段响应事件，普通文本穿透（避免影响节点拖动/选中）
    listening: isRef,
  }
}

// ── 事件处理 ──

/** 双击开始编辑（仅响应左键；右键双击留给 contextmenu，避免误进入文字编辑） */
function onDblClick(e: KonvaEventObject<MouseEvent>): void {
  if (e.evt.button !== 0) return
  emit('dblclick', props.nodeId)
}

/** 普通片段/引用片段 mousedown：引用片段阻止冒泡，避免触发节点拖动/选中 */
function onSegMouseDown(e: KonvaEventObject<MouseEvent>, item: { seg: Segment; x: number }): void {
  if (item.seg.type !== 'ref') return
  e.cancelBubble = true // 阻止冒泡到 stage，避免 nodeDrag/marquee 接管
}

/** 普通片段/引用片段 click：引用片段跳转到被引用节点 */
function onSegClick(item: { seg: Segment; x: number }): void {
  if (item.seg.type !== 'ref' || !item.seg.refName) return
  const targetId = nodeStore.getReferenceNodeId(item.seg.refName)
  if (targetId) {
    emit('referenceClick', targetId)
  }
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
    <template v-for="(line, lineIdx) in layoutLines" :key="lineIdx">
      <v-text
        v-for="(item, segIdx) in line.segments"
        :key="`${lineIdx}-${segIdx}`"
        :config="buildSegConfig(item, line.y)"
        @mousedown="onSegMouseDown($event, item)"
        @click="onSegClick(item)"
      />
    </template>
  </v-group>
</template>
