<script setup lang="ts">
/**
 * TextAutocomplete - 文本编辑器 @ 引用补全下拉
 *
 * 以 position:fixed 定位在视口坐标 (x, y) 处，超出视口边界时自动翻转方向。
 * 使用 Teleport 渲染到 body 避免被父级 overflow:hidden 裁切。
 * 点击外部按 Escape 时 emit close。
 *
 * 候选项用 @mousedown.prevent 阻止焦点转移，避免原生 textarea 因点击下拉而 blur。
 */
import { ref, watch, nextTick, onUnmounted } from 'vue'
import type { AutocompleteCandidate } from '@/composables/useReferenceAutocomplete'
import { t } from '@/composables/useT'

// ── Props ──
const props = defineProps<{
  visible: boolean
  /** 视口坐标 x（下拉左上角） */
  x: number
  /** 视口坐标 y（下拉左上角） */
  y: number
  candidates: AutocompleteCandidate[]
  activeIndex: number
}>()

// ── Emits ──
const emit = defineEmits<{
  select: [candidate: AutocompleteCandidate]
  close: []
}>()

// ── Refs ──
/** 下拉 DOM 元素引用，用于尺寸测量与外部点击判断 */
const menuRef = ref<HTMLElement | null>(null)

/** 翻转后的定位样式 */
const positionStyle = ref({ left: '0px', top: '0px' })

// ── 事件处理 ──

/** 点击候选：emit select（mousedown.prevent 已阻止 textarea blur） */
function handleItemClick(candidate: AutocompleteCandidate): void {
  emit('select', candidate)
  emit('close')
}

/**
 * 边界翻转计算：测量实际尺寸，超出视口右侧/底部时翻转。
 * 保留 8px 边距避免贴边。
 */
function updatePosition(): void {
  if (!menuRef.value) return
  const rect = menuRef.value.getBoundingClientRect()
  const { innerWidth, innerHeight } = window
  let adjustedX = props.x
  let adjustedY = props.y

  if (adjustedX + rect.width > innerWidth - 8) {
    adjustedX = Math.max(8, innerWidth - rect.width - 8)
  }
  if (adjustedY + rect.height > innerHeight - 8) {
    adjustedY = Math.max(8, innerHeight - rect.height - 8)
  }

  positionStyle.value = {
    left: `${adjustedX}px`,
    top: `${adjustedY}px`,
  }
}

/** 点击外部 → emit close */
function onDocumentMouseDown(e: MouseEvent): void {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    emit('close')
  }
}

/** 按 Escape → emit close */
function onDocumentKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    emit('close')
  }
}

// ── 生命周期与监听 ──

/** 监听 visible / x / y 变化：visible 变 true 时定位并挂全局监听 */
watch(
  [() => props.visible, () => props.x, () => props.y],
  ([visible]) => {
    if (visible) {
      nextTick(updatePosition)
      document.addEventListener('mousedown', onDocumentMouseDown)
      document.addEventListener('keydown', onDocumentKeyDown)
    } else {
      document.removeEventListener('mousedown', onDocumentMouseDown)
      document.removeEventListener('keydown', onDocumentKeyDown)
    }
  },
)

/** 组件卸载时清理全局事件 */
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  document.removeEventListener('keydown', onDocumentKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="autocomplete">
      <div
        v-if="visible"
        ref="menuRef"
        class="autocomplete"
        :style="positionStyle"
      >
        <div
          v-if="candidates.length === 0"
          class="autocomplete-empty"
        >
          {{ t('nodeEditor.referenceNoMatch') }}
        </div>
        <div
          v-for="(candidate, index) in candidates"
          :key="candidate.nodeId"
          class="autocomplete-item"
          :class="{ 'autocomplete-item--active': index === activeIndex }"
          @mousedown.prevent
          @click="handleItemClick(candidate)"
        >
          <span class="autocomplete-item__prefix">@</span>
          <span class="autocomplete-item__name">{{ candidate.name }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.autocomplete {
  position: fixed;
  min-width: 160px;
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
  background: var(--color-surface);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
  z-index: 9999;
  font-size: 13px;
  user-select: none;
}

.autocomplete-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.12s ease;
}

.autocomplete-item:hover {
  background-color: var(--color-bg);
}

.autocomplete-item--active {
  background-color: var(--color-active-bg);
}

.autocomplete-item__prefix {
  color: var(--color-text-muted);
  font-weight: 600;
}

.autocomplete-item__name {
  color: var(--color-text);
}

.autocomplete-empty {
  padding: 8px 10px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

/* ── 过渡动画 ── */
.autocomplete-enter-active {
  transition:
    opacity 0.15s ease-out,
    transform 0.15s ease-out;
}

.autocomplete-leave-active {
  transition:
    opacity 0.1s ease-in,
    transform 0.1s ease-in;
}

.autocomplete-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.autocomplete-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}
</style>