<script setup lang="ts">
/**
 * ActivityBar - 左侧活动栏（VSCode 风格）：竖向固定条展示左侧面板图标，
 * 点击切换激活面板（激活项再点即收起）；支持 HTML5 拖拽排序并接收右侧 dock 拖入。
 */
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { NTooltip, NDropdown } from 'naive-ui'
import { AddOutline } from '@vicons/ionicons5'
import { useLayoutStore } from '@/stores/layout'
import type { PanelKey } from '@/constants/panels'
import type { UiPanelEntry } from '@/stores/uiRegistry'
import { readPanelDrag, writePanelDrag } from '@/utils/dock'
import { t } from '@/composables/useT'

const layout = useLayoutStore()

/** 活动栏实时目录与未放置目录（storeToRefs 取响应式 ref；layout 为 setup store，成员默认已解包） */
const { leftPanels: orderedPanels, unplacedPanels } = storeToRefs(layout)

// ── HTML5 拖拽排序状态 ──

const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)
/** 拖拽结束时抑制紧随其后的 click，避免误切换面板 */
const suppressClick = ref(false)

function onDragStart(index: number, panel: UiPanelEntry, e: DragEvent): void {
  dragIndex.value = index
  suppressClick.value = true
  writePanelDrag(e, { panelId: panel.key, from: 'left' })
}

// ── 活动栏容器作为拖拽目标（接收来自右侧 dock 的面板）──

const isDropTarget = ref(false)

function onContainerDragOver(e: DragEvent): void {
  isDropTarget.value = readPanelDrag(e)?.from === 'right'
}

function onContainerDrop(e: DragEvent): void {
  const data = readPanelDrag(e)
  if (data && data.from === 'right') {
    layout.moveToLeft(data.panelId)
  }
  isDropTarget.value = false
}

function onContainerDragLeave(): void {
  isDropTarget.value = false
}

// ── 底部「添加面板」浮层列出未放置面板 ──

const addMenuOptions = computed(() =>
  unplacedPanels.value.map((p) => ({
    label: p.title ?? t(p.titleKey ?? p.key),
    key: p.key,
  })),
)

function handleAddSelect(key: string): void {
  layout.moveToLeft(key as PanelKey)
}

function onDragOver(index: number, e: DragEvent): void {
  e.preventDefault()
  if (dragIndex.value !== null && dragIndex.value !== index) {
    dropIndex.value = index
  }
}

function onDrop(index: number, e: DragEvent): void {
  e.preventDefault()
  if (dragIndex.value !== null) {
    layout.reorder(dragIndex.value, index)
  }
  endDrag()
}

function onDragEnd(): void {
  endDrag()
}

function endDrag(): void {
  dragIndex.value = null
  dropIndex.value = null
  // 本 tick 后放开 click 抑制
  setTimeout(() => {
    suppressClick.value = false
  }, 0)
}

function handleClick(id: PanelKey): void {
  if (suppressClick.value) {
    suppressClick.value = false
    return
  }
  layout.togglePanel(id)
}
</script>

<template>
  <div
    class="activity-bar"
    :class="{ 'is-drop-target': isDropTarget }"
    @dragover.prevent="onContainerDragOver"
    @drop.prevent="onContainerDrop"
    @dragleave="onContainerDragLeave"
  >
    <NTooltip
      v-for="(panel, index) in orderedPanels"
      :key="panel.key"
      placement="right"
    >
      <template #trigger>
        <button
          type="button"
          class="activity-item"
          :class="{
            active: layout.activeId === panel.key && !layout.collapsed,
            'is-dragging': dragIndex === index,
            'is-drop-target': dropIndex === index && dragIndex !== null && dragIndex !== index,
          }"
          :draggable="true"
          @click="handleClick(panel.key)"
          @dragstart.stop="onDragStart(index, panel, $event)"
          @dragenter.prevent="dropIndex = index"
          @dragover.prevent="onDragOver(index, $event)"
          @dragleave="dropIndex === index && (dropIndex = null)"
          @drop.prevent="onDrop(index, $event)"
          @dragend="onDragEnd"
        >
          <component :is="panel.icon" class="activity-icon" />
        </button>
      </template>
      {{ panel.title ?? t(panel.titleKey ?? panel.key) }}
    </NTooltip>

    <!-- 底部「添加面板」按钮：弹出未放置面板浮层 -->
    <div class="add-panel-wrap">
      <NDropdown
        v-if="unplacedPanels.length"
        :options="addMenuOptions"
        trigger="click"
        placement="right"
        @select="handleAddSelect"
      >
        <button type="button" class="activity-item add-panel" title="">
          <AddOutline class="activity-icon" />
        </button>
      </NDropdown>
      <NTooltip v-else placement="right">
        <template #trigger>
          <button type="button" class="activity-item add-panel" disabled>
            <AddOutline class="activity-icon" />
          </button>
        </template>
        {{ t('dock.noPanel') }}
      </NTooltip>
    </div>
  </div>
</template>

<style scoped>
.activity-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 48px;
  flex-shrink: 0;
  padding: 8px 0;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  overflow: hidden;
}

.activity-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--color-text);
  opacity: 0.6;
  transition: background 0.15s, opacity 0.15s;
  position: relative;
}

/* 激活态：左侧竖条指示 + 高亮 */
.activity-item.active {
  opacity: 1;
  background: var(--color-active-bg);
  color: var(--color-text);
}

.activity-item.active::before {
  content: '';
  position: absolute;
  left: -4px;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 2px;
  background: var(--color-primary);
}

.activity-item:hover {
  opacity: 1;
  background: var(--color-hover);
}

.activity-icon {
  width: 22px;
  height: 22px;
}

/* 底部添加面板按钮：与图标列表间隔开，悬浮在底部 */
.add-panel-wrap {
  margin-top: auto;
  width: 100%;
  display: flex;
  justify-content: center;
  padding-top: 4px;
}

.add-panel {
  opacity: 0.5;
}

.add-panel:hover {
  opacity: 1;
}

.add-panel:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}

/* 从右侧拖入时的容器高亮：整个活动栏描边提示可投放 */
.activity-bar.is-drop-target {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
  border-radius: 4px;
}

/* 拖拽中的被拖项：半透明 */
.activity-item.is-dragging {
  opacity: 0.4;
}

/* 拖拽悬停目标：顶部指示条 */
.activity-item.is-drop-target::after {
  content: '';
  position: absolute;
  left: 6px;
  right: 6px;
  top: -2px;
  height: 3px;
  border-radius: 2px;
  background: var(--color-primary);
}
</style>