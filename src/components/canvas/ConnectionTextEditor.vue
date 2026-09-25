<script setup lang="ts">
/**
 * ConnectionTextEditor - 连线文字内联编辑器（DOM textarea 覆盖层，定位在连线中点）。
 * Enter/Blur 保存、Escape 取消；空文字保存时上层转 null。
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import {
  CONNECTION_LABEL_FONT_SIZE,
  CONNECTION_LABEL_LINE_HEIGHT,
  CONNECTION_LABEL_PADDING,
  CONNECTION_LABEL_RADIUS,
  DEFAULT_NODE_STYLE,
} from '@/constants'
import { useThemeStore } from '@/stores/theme'

// ── Props ──
const props = defineProps<{
  /** 连线 ID */
  connectionId: string
  /** 初始文字（连线无文字时传空字符串） */
  initialText: string
  /** 连线中点在 Konva Stage 中的 x 坐标（世界坐标） */
  midX: number
  /** 连线中点在 Konva Stage 中的 y 坐标（世界坐标） */
  midY: number
  /** 连线颜色（用于编辑器边框，保持视觉一致） */
  connColor: string
  /** 当前 Stage 缩放倍率 */
  stageScale: number
  /** 当前 Stage X 偏移 */
  stageX: number
  /** 当前 Stage Y 偏移 */
  stageY: number
}>()

// ── Emits ──
const emit = defineEmits<{
  save: [connectionId: string, text: string]
  cancel: []
}>()

// ── Refs ──
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const currentText = ref(props.initialText)

const themeStore = useThemeStore()

// ── 编辑器尺寸估算（基于初始文字，世界坐标） ──
const fontSize = CONNECTION_LABEL_FONT_SIZE
const padX = CONNECTION_LABEL_PADDING
const padY = CONNECTION_LABEL_PADDING * 0.6
const baseWidth = Math.max(
  props.initialText.length * fontSize + padX * 2,
  80,
)
const baseHeight = fontSize * CONNECTION_LABEL_LINE_HEIGHT + padY * 2

/**
 * 编辑器 CSS 定位样式（相对于 Stage 容器）
 * 中点世界坐标 -> 屏幕像素 -> 减去编辑器一半宽高居中
 */
const editorStyle = computed(() => {
  const screenX = props.midX * props.stageScale + props.stageX
  const screenY = props.midY * props.stageScale + props.stageY
  const w = baseWidth * props.stageScale
  const h = baseHeight * props.stageScale
  return {
    position: 'absolute' as const,
    left: `${screenX - w / 2}px`,
    top: `${screenY - h}px`,
    width: `${w}px`,
    minHeight: `${h}px`,
    fontSize: `${fontSize * props.stageScale}px`,
    fontFamily: DEFAULT_NODE_STYLE.fontFamily,
    padding: `${padY * props.stageScale}px ${padX * props.stageScale}px`,
    border: `2px solid ${props.connColor}`,
    borderRadius: `${CONNECTION_LABEL_RADIUS * props.stageScale}px`,
    background: themeStore.scheme.canvas.background,
    color: themeStore.scheme.canvas.nodeTextColor,
    textAlign: 'center' as const,
    resize: 'none' as const,
    outline: 'none',
    zIndex: 1000,
    boxSizing: 'border-box' as const,
    lineHeight: String(CONNECTION_LABEL_LINE_HEIGHT),
    overflow: 'hidden',
  }
})

// ── 生命周期 ──
onMounted(async () => {
  await nextTick()
  const textarea = textareaRef.value
  if (textarea) {
    textarea.focus()
    textarea.select()
  }
})

// ── 内部状态与事件处理 ──
/** 竞态守卫：Enter 保存后组件卸载引发的 blur 不得二次触发 save */
let saved = false

function save() {
  if (saved) return
  saved = true
  emit('save', props.connectionId, currentText.value)
}

function cancel() {
  if (saved) return
  saved = true
  emit('cancel')
}

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

/** 失焦保存；延迟执行，让 Enter 的 save() 先置 saved 标志防双触发 */
function onBlur() {
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
