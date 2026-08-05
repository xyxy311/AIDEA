<script setup lang="ts">
/**
 * NodeTextEditor - 节点文本内联编辑器
 *
 * 一个绝对定位的 DOM textarea 覆盖层，渲染在 Konva Stage 上方。
 * 用于节点的双击文本编辑场景。
 *
 * 定位计算：
 * - Konva Stage 使用自己的坐标系统
 * - 需要将 Konva 坐标转换为页面像素坐标用于 CSS 定位
 * - 通过 stage.getContainer().getBoundingClientRect() 获取偏移量
 *
 * 键盘行为：
 * - Enter（非 Shift）→ 保存并关闭
 * - Escape → 取消并关闭
 * - Blur（失焦）→ 保存并关闭
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { DEFAULT_NODE_STYLE, NODE_PADDING } from '@/constants'
import { useThemeStore } from '@/stores/theme'
import { useNodeStore } from '@/stores/node'
import { deriveBackgroundColor } from '@/utils/color'

// ── Props ──
const props = defineProps<{
  /** 节点 ID */
  nodeId: string
  /** 初始文本内容 */
  initialText: string
  /** 节点在 Konva Stage 中的 x 坐标 */
  nodeX: number
  /** 节点在 Konva Stage 中的 y 坐标 */
  nodeY: number
  /** 节点宽度 */
  nodeWidth: number
  /** 节点高度 */
  nodeHeight: number
  /** Stage 容器 DOM 元素（用于坐标转换） */
  stageContainer: HTMLDivElement
  /** 当前 Stage 缩放倍率 */
  stageScale: number
  /** 当前 Stage X 偏移 */
  stageX: number
  /** 当前 Stage Y 偏移 */
  stageY: number
}>()

// ── Emits ──
const emit = defineEmits<{
  save: [nodeId: string, text: string]
  cancel: []
}>()

// ── Refs ──
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const currentText = ref(props.initialText)

// ── 计算编辑器位置 ──
/** themeStore 实例，用于读取当前主色 */
const themeStore = useThemeStore()
/** nodeStore 实例，用于读取节点边框色以派生背景色 */
const nodeStore = useNodeStore()

/**
 * 编辑器 CSS 定位样式（相对于 Stage 容器）
 * 需要将 Konva 坐标转换为屏幕像素坐标：
 *   屏幕坐标 = Konva坐标 × 缩放倍率 + Stage偏移
 */
const editorStyle = computed(() => ({
  position: 'absolute' as const,
  left: `${props.nodeX * props.stageScale + props.stageX}px`,
  top: `${props.nodeY * props.stageScale + props.stageY}px`,
  width: `${props.nodeWidth * props.stageScale}px`,
  minHeight: `${props.nodeHeight * props.stageScale}px`,
  fontSize: `${DEFAULT_NODE_STYLE.fontSize * props.stageScale}px`,
  fontFamily: DEFAULT_NODE_STYLE.fontFamily,
  padding: `${NODE_PADDING * props.stageScale}px`,
  border: `2px solid ${nodeStore.getNode(props.nodeId)?.borderColor ?? DEFAULT_NODE_STYLE.borderColor}`,
  borderRadius: `${DEFAULT_NODE_STYLE.borderRadius * props.stageScale}px`,
  background: deriveBackgroundColor(
    nodeStore.getNode(props.nodeId)?.borderColor ?? DEFAULT_NODE_STYLE.borderColor,
    themeStore.isDark,
  ),
  color: themeStore.scheme.canvas.nodeTextColor,
  resize: 'none' as const,
  outline: 'none',
  zIndex: 1000,
  boxSizing: 'border-box' as const,
  lineHeight: '1.5',
  overflow: 'hidden',
}))

// ── 生命周期 ──
onMounted(async () => {
  await nextTick()
  const textarea = textareaRef.value
  if (textarea) {
    textarea.focus()
    textarea.select()
  }
})

// ── 内部状态 ──
/** 防止组件卸载时的 blur 事件二次触发 save */
let saved = false

// ── 事件处理 ──

/** 保存编辑内容 */
function save() {
  if (saved) return
  saved = true
  emit('save', props.nodeId, currentText.value)
}

/** 取消编辑 */
function cancel() {
  if (saved) return
  saved = true
  emit('cancel')
}

/** 键盘事件处理 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    save()
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  }
}

/** 失焦时自动保存（Enter 保存后组件卸载引发的 blur 会被 saved 守卫拦截） */
function onBlur() {
  // 延迟执行，让 Enter 的 save() 先设置 saved 标志
  // 避免 blur 在 save 之前触发
  setTimeout(() => {
    save()
  }, 0)
}
</script>

<template>
  <textarea
    ref="textareaRef"
    v-model="currentText"
    :style="editorStyle"
    @keydown="onKeydown"
    @blur="onBlur"
  />
</template>
