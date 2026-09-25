<script setup lang="ts">
/**
 * WhiteboardNode - 白板节点组件：用 v-group + v-rect + 多片段 v-text 渲染，文本按 `@引用` 分段高亮，
 * 双击编辑、点击引用跳转、右下角渲染标签胶囊。
 */
import { ref, computed } from 'vue'
import type { VueKonvaRef } from 'vue-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useNodeStore } from '@/stores/node'
import { useThemeStore } from '@/stores/theme'
import { useTagsStore } from '@/stores/tags'
import { deriveBackgroundColor, getContrastTextColor } from '@/utils/color'
import {
  parseReferenceSegments,
  layoutReferenceText,
  type Segment,
} from '@/utils/reference'
import { measureLineWidth } from '@/utils/geometry'
import { t } from '@/composables/useT'
import {
  DEFAULT_NODE_STYLE,
  NODE_PADDING,
  NODE_LINE_HEIGHT,
  PLACEHOLDER_TEXT_KEY,
  PLACEHOLDER_TEXT_COLOR,
  TAG_CAPSULE_HEIGHT,
  TAG_CAPSULE_FONT_SIZE,
  TAG_CAPSULE_PADDING_X,
  TAG_CAPSULE_GAP,
  TAG_CAPSULE_RADIUS,
  TAG_CAPSULE_BOTTOM_GAP,
  TAG_CAPSULE_MAX,
} from '@/constants'

// ── Props ──
const props = defineProps<{
  nodeId: string
}>()

// ── Emits ──
const emit = defineEmits<{
  dblclick: [nodeId: string]
  referenceClick: [targetNodeId: string]
}>()

// ── Store ──
const nodeStore = useNodeStore()
const themeStore = useThemeStore()
const tagsStore = useTagsStore()

// ── Refs ──
const rectRef = ref<VueKonvaRef<Konva.Rect> | null>(null)
/** 节点组引用（供父组件选中时调用 moveToTop 调整层级） */
const groupRef = ref<VueKonvaRef<Konva.Group> | null>(null)

// 从 reactive Map 获取节点代理，属性变化自动触发下游 computed
const node = computed(() => nodeStore.getNode(props.nodeId))

// ── Konva 节点配置 ──
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
 * 文本布局：解析多行多片段并叠加 padding 与垂直居中偏移，产出相对 group 的绝对坐标。
 * 每行片段 x 由行起点 + 该片段前所有片段宽度之和累加；带标签时底部预留胶囊空间。
 */
const layoutLines = computed(() => {
  const n = node.value
  if (!n) return []
  const isPlaceholder = !n.text
  // 占位符不解析引用（整体作普通文本），文案经 t() 实时翻译
  const paragraphs = isPlaceholder
    ? [[{ type: 'text' as const, text: t(PLACEHOLDER_TEXT_KEY) }]]
    : parseReferenceSegments(n.text)
  const contentWidth = n.width - NODE_PADDING * 2
  const fontSize = DEFAULT_NODE_STYLE.fontSize
  const fontFamily = DEFAULT_NODE_STYLE.fontFamily
  const lines = layoutReferenceText(paragraphs, contentWidth, fontSize, fontFamily, NODE_LINE_HEIGHT)
  // 垂直居中：起始 y = (可用高度 - 总高度)/2（至少留 padding）
  const totalHeight = lines.length * (fontSize * NODE_LINE_HEIGHT)
  // 底部预留：有标签时让出胶囊高度 + 与文本的间距
  const reservedBottom = hasTags.value
    ? NODE_PADDING + TAG_CAPSULE_HEIGHT + TAG_CAPSULE_BOTTOM_GAP
    : 0
  const availableHeight = n.height - reservedBottom
  const offsetY = Math.max(NODE_PADDING, (availableHeight - totalHeight) / 2)
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

// ── 标签（节点右下角胶囊） ──
/** 节点有效标签：过滤 tagIds 中已删除标签的 id（undo 跨删标签边界场景） */
const nodeTags = computed(() => {
  const tagIds = node.value?.tagIds ?? []
  return tagIds.map((id) => tagsStore.getTag(id)).filter((t): t is NonNullable<typeof t> => !!t)
})

/** 是否有标签（决定文本是否让出底部空间） */
const hasTags = computed(() => nodeTags.value.length > 0)

/** 底部溢出胶囊的填充色（chrome 色，随主题明暗） */
const overflowFill = computed(() =>
  themeStore.isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)',
)

/** 溢出胶囊文字色（随主题） */
const overflowText = computed(() => themeStore.scheme.canvas.nodeTextColor)

/** 标签胶囊布局片段（含绝对坐标） */
interface CapsulePiece {
  type: 'tag' | 'overflow'
  id?: string
  name?: string
  color?: string
  count?: number
  text: string
  width: number
  x: number
  y: number
  height: number
}

/** 节点右下角标签胶囊的绝对布局（相对 group，右对齐） */
const capsuleLayout = computed(() => {
  const n = node.value
  if (!n) return []
  const fontSize = TAG_CAPSULE_FONT_SIZE
  const fontFamily = DEFAULT_NODE_STYLE.fontFamily

  const capsuleY = n.height - NODE_PADDING - TAG_CAPSULE_HEIGHT

  let overflow = 0
  let laid: CapsulePiece[] = []
  for (;;) {
    // 溢出计数改变溢出胶囊宽度 → 影响可放置标签数 → 又反哺计数，迭代至稳定
    let cursorX = n.width - NODE_PADDING
    const temp: CapsulePiece[] = []
    if (overflow > 0) {
      const text = `+${overflow}`
      const width = TAG_CAPSULE_PADDING_X * 2 + measureLineWidth(text, fontSize, fontFamily)
      const x = cursorX - width
      if (x >= NODE_PADDING) {
        temp.push({ type: 'overflow', count: overflow, text, width, x, y: capsuleY, height: TAG_CAPSULE_HEIGHT })
        cursorX = x - TAG_CAPSULE_GAP
      }
    }
    // 放标签胶囊（最多 TAG_CAPSULE_MAX 个），放不下即截断
    let placedCount = 0
    for (const tag of nodeTags.value.slice(0, TAG_CAPSULE_MAX)) {
      const width = TAG_CAPSULE_PADDING_X * 2 + measureLineWidth(tag.name, fontSize, fontFamily)
      const x = cursorX - width
      if (x < NODE_PADDING) break
      temp.push({ type: 'tag', id: tag.id, name: tag.name, color: tag.color, text: tag.name, width, x, y: capsuleY, height: TAG_CAPSULE_HEIGHT })
      cursorX = x - TAG_CAPSULE_GAP
      placedCount++
    }
    // 溢出数 = 总标签数 - 实际放置数（不含溢出胶囊）
    const newOverflow = nodeTags.value.length - placedCount
    if (newOverflow === overflow) {
      laid = temp
      break
    }
    overflow = newOverflow
  }
  // 从右往左收集，反转回从左到右
  return laid.reverse()
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
    // 单片段不换行（布局已拆好），禁用 wrap
    wrap: 'none' as const,
    fill: isPlaceholder
      ? PLACEHOLDER_TEXT_COLOR
      : isRef
        ? refColor.value
        : themeStore.scheme.canvas.nodeTextColor,
    // 引用片段加下划线
    textDecoration: isRef ? ('underline' as const) : ('none' as const),
    // 仅引用片段响应事件，普通文本穿透（不拦截节点拖动/选中）
    listening: isRef,
  }
}

/** 标签胶囊 Konva.Rect 配置（纯装饰，不响应事件） */
function buildCapsuleRectConfig(piece: (typeof capsuleLayout.value)[number]) {
  return {
    x: piece.x,
    y: piece.y,
    width: piece.width,
    height: piece.height,
    cornerRadius: TAG_CAPSULE_RADIUS,
    // 标签为数据色（Tag.color）；溢出胶囊用随主题的 chrome 色
    fill: piece.type === 'tag' ? piece.color : overflowFill.value,
    listening: false,
  }
}

/** 标签胶囊 Konva.Text 配置（文字对比色由背景亮度决定） */
function buildCapsuleTextConfig(piece: (typeof capsuleLayout.value)[number]) {
  return {
    text: piece.text,
    x: piece.x + TAG_CAPSULE_PADDING_X,
    y: piece.y + (TAG_CAPSULE_HEIGHT - TAG_CAPSULE_FONT_SIZE * 1.2) / 2,
    fontSize: TAG_CAPSULE_FONT_SIZE,
    fontFamily: DEFAULT_NODE_STYLE.fontFamily,
    fill:
      piece.type === 'tag'
        ? getContrastTextColor(piece.color ?? '#ffffff')
        : overflowText.value,
    listening: false,
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

    <!-- 标签胶囊（节点右下角，右对齐，纯装饰不响应事件） -->
    <template v-for="(piece, idx) in capsuleLayout" :key="`capsule-${idx}`">
      <v-rect :config="buildCapsuleRectConfig(piece)" />
      <v-text :config="buildCapsuleTextConfig(piece)" />
    </template>
  </v-group>
</template>
