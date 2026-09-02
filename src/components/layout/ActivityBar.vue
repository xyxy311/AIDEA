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
 * 渲染顺序 = layout.panels（受拖拽 reorder 影响），元信息从 PANEL_CATALOG 解析。
 */
import { computed, ref } from 'vue'
import { NTooltip, NDropdown } from 'naive-ui'
import { AddOutline } from '@vicons/ionicons5'
import { useLayoutStore } from '@/stores/layout'
import type { PanelId, PanelKey } from '@/constants/panels'
import { useMergedPanelIndex, type PanelMeta } from '@/plugin/uiMerge'
import { readPanelDrag, writePanelDrag } from '@/utils/dock'
import { t } from '@/composables/useT'

const layout = useLayoutStore()

/** 合并面板目录（内置优先，插件兜底）——活动栏图标/标题单一来源 */
const merged = useMergedPanelIndex()

/** 按 layout store 的面板顺序，解析每个面板的元信息（内置或插件） */
const orderedPanels = computed<PanelMeta[]>(() =>
  layout.panels
    .map((id) => merged.value.get(id))
    .filter((p): p is PanelMeta => !!p),
)

// ── HTML5 拖拽排序状态 ──

const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)
/** 拖拽刚结束时抑制紧随其后的 click，避免误切换面板 */
const suppressClick = ref(false)

function onDragStart(index: number, panel: PanelMeta, e: DragEvent): void {
  dragIndex.value = index
  suppressClick.value = true
  // 写入统一跨容器拖拽协议，供右侧 dock 接收本面板
  writePanelDrag(e, { panelId: panel.id, from: 'left' })
}

// ── 活动栏容器作为拖拽目标（接收来自右侧 dock 的面板）──

/** 是否高亮为可接收从右侧拖入的目标 */
const isDropTarget = ref(false)

function onContainerDragOver(e: DragEvent): void {
  // 仅当拖拽来自右侧 dock 时高亮可投放
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

// ── 底部「添加面板」─ 浮层列出未放置面板 ──

/** 未放置的面板：既不在左侧也不在右侧的全部可放置面板（内置 + 插件） */
const unplacedPanels = computed<PanelMeta[]>(() =>
  [...merged.value.values()].filter(
    (p) => !layout.panels.includes(p.id) && !layout.rightPanels.includes(p.id),
  ),
)

/** 添加面板下拉选项（优先插件 title 字符串，否则内置 titleKey i18n） */
const addMenuOptions = computed(() =>
  unplacedPanels.value.map((p) => ({
    label: p.title ?? t(p.titleKey ?? p.id),
    key: p.id,
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
  // 本 tick 后放开 click 抑制（拖拽结束若顺带触发 click 会被忽略）
  setTimeout(() => {
    suppressClick.value = false
  }, 0)
}

/** 点击切换面板（拖拽刚结束时忽略该次 click）。layout.togglePanel 参数为内置类型，
 *  插件面板 key 经 as 收窄传入（运行时只存字符串，语义不变）。 */
function handleClick(id: PanelKey): void {
  if (suppressClick.value) {
    suppressClick.value = false
    return
  }
  layout.togglePanel(id as PanelId)
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
      {{ panel.title ?? t(panel.titleKey ?? panel.id) }}
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