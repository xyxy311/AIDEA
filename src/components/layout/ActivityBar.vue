<script setup lang="ts">
/**
 * ActivityBar - 左侧活动栏（VSCode 风格）
 *
 * 竖向固定条，展示左侧所有面板的图标：
 * - 悬停有 tooltip（读取面板 titleKey 的 i18n 文案）
 * - 点击切换激活面板（点击激活项的图标即收起面板区）
 * - 图标支持拖拽排序（HTML5 drag，复用 preset 列表排序模式）
 * - 拖拽结束时抑制随后的 click，避免误切换面板
 *
 * 面板列表与顺序来自 layout store（内存态，不持久化），
 * 渲染顺序 = layout.panels（受拖拽 reorder 影响），元信息从 PANEL_REGISTRY 解析。
 */
import { computed, ref } from 'vue'
import { NTooltip } from 'naive-ui'
import { useLayoutStore } from '@/stores/layout'
import { PANEL_REGISTRY, type PanelId, type PanelMeta } from '@/constants/panels'
import { t } from '@/composables/useT'

const layout = useLayoutStore()

/** 按 layout store 的面板顺序，解析每个面板的元信息 */
const orderedPanels = computed<PanelMeta[]>(() =>
  layout.panels
    .map((id) => PANEL_REGISTRY.find((p) => p.id === id))
    .filter((p): p is PanelMeta => !!p),
)

// ── HTML5 拖拽排序状态 ──

const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)
/** 拖拽刚结束时抑制紧随其后的 click，避免误切换面板 */
const suppressClick = ref(false)

function onDragStart(index: number, e: DragEvent): void {
  dragIndex.value = index
  suppressClick.value = true
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
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
  // 本 tick 后放开 click 抑制（拖拽结束若顺带触发 click 会被忽略）
  setTimeout(() => {
    suppressClick.value = false
  }, 0)
}

/** 点击切换面板（拖拽刚结束时忽略该次 click） */
function handleClick(id: PanelId): void {
  if (suppressClick.value) {
    suppressClick.value = false
    return
  }
  layout.togglePanel(id)
}
</script>

<template>
  <div class="activity-bar">
    <NTooltip
      v-for="(panel, index) in orderedPanels"
      :key="panel.id"
      placement="right"
    >
      <template #trigger>
        <button
          type="button"
          class="activity-item"
          :class="{
            active: layout.activeId === panel.id && !layout.collapsed,
            'is-dragging': dragIndex === index,
            'is-drop-target': dropIndex === index && dragIndex !== null && dragIndex !== index,
          }"
          :draggable="true"
          @click="handleClick(panel.id)"
          @dragstart.stop="onDragStart(index, $event)"
          @dragenter.prevent="dropIndex = index"
          @dragover.prevent="onDragOver(index, $event)"
          @dragleave="dropIndex === index && (dropIndex = null)"
          @drop.prevent="onDrop(index, $event)"
          @dragend="onDragEnd"
        >
          <component :is="panel.icon" class="activity-icon" />
        </button>
      </template>
      {{ t(panel.titleKey) }}
    </NTooltip>
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