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
import { useMessage } from 'naive-ui'
import { DEFAULT_NODE_STYLE, NODE_PADDING } from '@/constants'
import { useThemeStore } from '@/stores/theme'
import { useNodeStore } from '@/stores/node'
import { deriveBackgroundColor } from '@/utils/color'
import { extractReferenceName } from '@/utils/reference'
import { useReferenceAutocomplete, type AutocompleteCandidate } from '@/composables/useReferenceAutocomplete'
import { t } from '@/composables/useT'
import TextAutocomplete from './TextAutocomplete.vue'

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

// ── @ 补全 ──
/** 补全共享逻辑实例 */
const autocomplete = useReferenceAutocomplete()
/** 全局消息（用于重名冲突提示） */
const message = useMessage()
/** 下拉定位（视口坐标） */
const dropdownPos = ref({ x: 0, y: 0 })

/** 计算下拉位置：定位在 textarea 元素下方 */
function updateDropdownPos(): void {
  const ta = textareaRef.value
  if (!ta) return
  const rect = ta.getBoundingClientRect()
  dropdownPos.value = { x: rect.left, y: rect.top + rect.height }
}

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
  // 校验引用名重名：编辑器内预先校验，冲突则弹窗并保持编辑态
  const refName = extractReferenceName(currentText.value)
  if (refName && nodeStore.isReferenceNameTaken(refName, props.nodeId)) {
    autocomplete.close()
    message.warning(t('nodeEditor.referenceNameConflict', { name: refName }))
    return
  }
  saved = true
  emit('save', props.nodeId, currentText.value)
}

/** 取消编辑 */
function cancel() {
  if (saved) return
  saved = true
  emit('cancel')
}

/** 输入事件：更新文本并处理补全 */
function onInput(e: Event) {
  const ta = e.target as HTMLTextAreaElement
  currentText.value = ta.value
  const cursor = ta.selectionStart ?? ta.value.length
  autocomplete.handleInput(currentText.value, cursor)
  if (autocomplete.visible.value) updateDropdownPos()
}

/** 点击补全候选：插入引用名 */
function handleAutocompleteSelect(candidate: AutocompleteCandidate) {
  const cursor = textareaRef.value?.selectionStart ?? currentText.value.length
  const result = autocomplete.insertCandidate(currentText.value, cursor, candidate.name)
  currentText.value = result.insertedText
  autocomplete.close()
  nextTick(() => {
    const ta = textareaRef.value
    if (ta) ta.setSelectionRange(result.newCursorPos, result.newCursorPos)
    ta?.focus()
  })
}

/** 键盘事件处理 */
function onKeydown(e: KeyboardEvent) {
  // 优先处理补全键
  const result = autocomplete.handleKeydown(
    e,
    currentText.value,
    textareaRef.value?.selectionStart ?? currentText.value.length,
  )
  if (result === 'handled') return
  if (result !== 'unhandled' && typeof result === 'object') {
    // 插入了候选
    currentText.value = result.insertedText
    nextTick(() => {
      const ta = textareaRef.value
      if (ta) ta.setSelectionRange(result.newCursorPos, result.newCursorPos)
    })
    return
  }
  // 原有 Enter/Escape 逻辑
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
    // 补全下拉打开时不因 blur 保存（下拉项用 mousedown.prevent 阻止 blur，此处兜底）
    if (autocomplete.visible.value) return
    save()
  }, 0)
}
</script>

<template>
  <textarea
    ref="textareaRef"
    :value="currentText"
    :style="editorStyle"
    @input="onInput"
    @keydown="onKeydown"
    @blur="onBlur"
  />
  <TextAutocomplete
    :visible="autocomplete.visible.value"
    :x="dropdownPos.x"
    :y="dropdownPos.y"
    :candidates="autocomplete.candidates.value"
    :active-index="autocomplete.activeIndex.value"
    @select="handleAutocompleteSelect"
    @close="autocomplete.close"
  />
</template>
