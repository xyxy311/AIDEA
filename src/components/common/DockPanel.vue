<script setup lang="ts">
/**
 * DockPanel — 通用 dock 面板包裹组件
 *
 * 为右侧 dock 中的每个面板提供统一 header：
 * - 左侧：拖拽手柄（⋮⋮，draggable，触发 dragStart 事件）
 * - 中间：面板标题（已 t() 后的字符串）
 * - 右侧：关闭按钮（触发 close 事件）
 *
 * DockPanel 本身不直接调用 store，拖拽与关闭都 emit 给父级 DockContainer 处理，
 * 保持组件通用性。
 */
import { NButton, NScrollbar } from 'naive-ui'
import { CloseOutline } from '@vicons/ionicons5'
import type { PanelId } from '@/constants/panels'

const props = defineProps<{
  /** 面板 id */
  panelId: PanelId
  /** 面板标题（已 t() 后的字符串） */
  title: string
  /** 是否显示关闭按钮，默认 true */
  removable?: boolean
}>()

const emit = defineEmits<{
  (e: 'dragStart', panelId: PanelId, ev: DragEvent): void
  (e: 'close', panelId: PanelId): void
}>()

/** 关闭按钮点击 → 触发 close 事件 */
function onClose(): void {
  emit('close', props.panelId)
}
</script>

<template>
  <div class="dock-panel">
    <div class="dock-panel-header">
      <span
        class="drag-handle"
        draggable="true"
        title="拖拽以移动面板"
        @dragstart.stop="emit('dragStart', panelId, $event)"
        @click.stop
      >
        ⋮⋮
      </span>
      <span class="dock-panel-title">{{ title }}</span>
      <NButton
        v-if="removable !== false"
        class="dock-panel-close"
        size="tiny"
        quaternary
        @click="onClose"
      >
        <template #icon>
          <CloseOutline />
        </template>
      </NButton>
    </div>
    <div class="dock-panel-body">
      <NScrollbar x-scrollable class="dock-panel-scroll">
        <slot />
      </NScrollbar>
    </div>
  </div>
</template>

<style scoped>
.dock-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.dock-panel-header {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 4px;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  flex-shrink: 0;
}

.dock-panel-title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
}

.dock-panel-close {
  flex-shrink: 0;
}

.dock-panel-body {
  flex: 1;
  min-height: 0;
  /* 高度不足时由内部 NScrollbar 滚动（纵向默认 + 横向 x-scrollable） */
  overflow: hidden;
}

/* NScrollbar 撑满 body 高度，便于内容滚动 */
.dock-panel-scroll {
  height: 100%;
}

/* 拖拽手柄样式（仿 DraggableSortList 的 .drag-handle） */
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
</style>