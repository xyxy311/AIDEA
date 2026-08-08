<script setup lang="ts" generic="T extends { id: string }">
import { ref } from 'vue'

defineProps<{
  items: T[]
  /** 是否显示 1-9 序号徽标（快捷键提示），默认 true */
  showShortcutBadge?: boolean
  /** 序号徽标 hover 提示 */
  shortcutTitle?: string
}>()

const emit = defineEmits<{
  (e: 'reorder', fromIndex: number, toIndex: number): void
  (e: 'rowClick', item: T): void
}>()

const draggedIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(index: number, e: DragEvent): void {
  draggedIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(index: number, e: DragEvent): void {
  e.preventDefault()
  if (draggedIndex.value === null || draggedIndex.value === index) return
  dragOverIndex.value = index
}

function onDrop(index: number, e: DragEvent): void {
  e.preventDefault()
  const fromIndex = draggedIndex.value
  if (fromIndex === null) {
    dragOverIndex.value = null
    return
  }
  if (fromIndex !== index) emit('reorder', fromIndex, index)
  dragOverIndex.value = null
  draggedIndex.value = null
}

function onDragEnd(): void {
  draggedIndex.value = null
  dragOverIndex.value = null
}

function onDragLeave(index: number, e: DragEvent): void {
  const target = e.target as HTMLElement
  const relatedTarget = e.relatedTarget as HTMLElement | null
  if (!relatedTarget || !target.contains(relatedTarget)) {
    if (dragOverIndex.value === index) dragOverIndex.value = null
  }
}

function handleRowClick(item: T): void {
  emit('rowClick', item)
}
</script>

<template>
  <div class="drag-list">
    <div
      v-for="(item, index) in items"
      :key="item.id"
      class="drag-row"
      :class="{
        'is-dragging': draggedIndex === index,
        'is-drag-over': dragOverIndex === index && draggedIndex !== null && draggedIndex !== index,
      }"
      @click="handleRowClick(item)"
      @dragover="onDragOver(index, $event)"
      @drop="onDrop(index, $event)"
      @dragenter.prevent="dragOverIndex = index"
      @dragleave="onDragLeave(index, $event)"
      @dragend="onDragEnd"
    >
      <span
        class="drag-handle"
        draggable="true"
        @dragstart.stop="onDragStart(index, $event)"
        @dragend.stop="onDragEnd"
        @click.stop
      >
        ⋮⋮
      </span>

      <span v-if="showShortcutBadge !== false && index < 9" class="shortcut-badge" :title="shortcutTitle">
        {{ index + 1 }}
      </span>

      <slot :item="item" :index="index" />
    </div>

    <slot v-if="items.length === 0" name="empty" />
  </div>
</template>

<style scoped>
.drag-list {
  padding: 4px;
}

.drag-row {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  gap: 5px;
  position: relative;
  user-select: none;
}

.drag-row:hover {
  background-color: var(--color-hover);
}

.drag-row.is-dragging {
  opacity: 0.35;
}

.drag-row.is-drag-over::before {
  content: '';
  position: absolute;
  top: 0;
  left: 4px;
  right: 4px;
  height: 2px;
  background-color: var(--color-primary);
  border-radius: 1px;
  pointer-events: none;
  z-index: 1;
}

.drag-handle {
  cursor: grab;
  color: var(--color-text-muted);
  font-size: 14px;
  letter-spacing: -3px;
  padding: 0 2px;
  flex-shrink: 0;
  line-height: 1;
  user-select: none;
}

.drag-handle:hover {
  color: var(--color-text-secondary);
}

.drag-handle:active {
  cursor: grabbing;
}

.shortcut-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: var(--color-primary-faint);
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
  line-height: 1;
}
</style>