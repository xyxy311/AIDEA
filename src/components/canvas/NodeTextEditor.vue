<script setup lang="ts">
/**
 * NodeTextEditor - 节点文本内联编辑器：绝对定位 DOM textarea 覆盖在 Konva Stage 上方，
 * 通过 stage 偏移/缩放换算为像素坐标；Enter 保存、Escape 取消、blur 保存，支持 @引用补全。
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
  nodeId: string
  initialText: string
  nodeX: number
  nodeY: number
  nodeWidth: number
  nodeHeight: number
  /** Stage 容器 DOM 元素（坐标换算基准） */
  stageContainer: HTMLDivElement
  stageScale: number
  stageX: number
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
const autocomplete = useReferenceAutocomplete()
const message = useMessage()
/** 下拉定位（视口坐标） */
const dropdownPos = ref({ x: 0, y: 0 })

/** 定位到 textarea 元素下方 */
function updateDropdownPos(): void {
  const ta = textareaRef.value
  if (!ta) return
  const rect = ta.getBoundingClientRect()
  dropdownPos.value = { x: rect.left, y: rect.top + rect.height }
}

// ── 计算编辑器位置 ──
const themeStore = useThemeStore()
const nodeStore = useNodeStore()

/** 编辑器 CSS 定位：屏幕像素 = Konva 坐标 × 缩放 + Stage 偏移 */
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
  // 预先校验引用名重名，冲突则弹窗并保持编辑态
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

/** 键盘事件：优先交给补全处理，未占用则走 Enter 保存 / Escape 取消 */
function onKeydown(e: KeyboardEvent) {
  const result = autocomplete.handleKeydown(
    e,
    currentText.value,
    textareaRef.value?.selectionStart ?? currentText.value.length,
  )
  if (result === 'handled') return
  if (result !== 'unhandled' && typeof result === 'object') {
    // 补全插入候选
    currentText.value = result.insertedText
    nextTick(() => {
      const ta = textareaRef.value
      if (ta) ta.setSelectionRange(result.newCursorPos, result.newCursorPos)
    })
    return
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    save()
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  }
}

/**
 * 失焦自动保存。延迟执行让 Enter 的 save() 先置 saved 标志，防 blur 二次触发；
 * 补全下拉打开时不保存（下拉项 mousedown.prevent 已阻止 blur，此处兜底）。
 */
function onBlur() {
  setTimeout(() => {
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
