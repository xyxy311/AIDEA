<script setup lang="ts">
/**
 * DockContainer — 通用右侧 dock 容器
 *
 * 垂直堆叠多个 DockPanel，提供：
 * - 面板间可上下拖拽的 resize handle（pointer events，保持相邻两块 flex 之和不变）
 * - 面板可拖拽换位（同容器 reorder / 来自左侧活动栏的 moveToRight）
 * - 作为跨容器 drop zone 接收来自左侧活动栏的面板
 * - 空态提示
 *
 * 每个面板由 DockPanel 统一外壳渲染（标题/图标/关闭/拖拽手柄），
 * 状态全部来自 layout store，本组件不持有布局数据。
 */
import { computed, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useLayoutStore } from '@/stores/layout'
import type { PanelKey } from '@/constants/panels'
import { useMergedPanelIndex } from '@/plugin/uiMerge'
import { readPanelDrag, writePanelDrag, type PanelDragData } from '@/utils/dock'
import { t } from '@/composables/useT'
import DockPanel from './DockPanel.vue'

const layout = useLayoutStore()

/** 合并面板目录（用于过滤未注册的禁用插件残留） */
const merged = useMergedPanelIndex()

/** 容器根元素（用于测量高度换算 flex） */
const containerEl = ref<HTMLElement | null>(null)

// ── 拖拽换位状态 ──
/** 当前拖拽源信息（仅同容器内拖拽时在本地维护；跨容器靠 dataTransfer） */
const dragSource = ref<PanelDragData | null>(null)
/** 当前 hover 的目标面板索引（真实索引，用于指示条） */
const dragOverIndex = ref<number | null>(null)

// ── resize 状态 ──
const resizeIndex = ref<number | null>(null)
const resizeStartY = ref(0)
const resizeStartB = ref(1)
const resizeTotal = ref(2)
const resizeScale = ref(1)
/** resize 涉及的两块面板 id（用 id 定位，避免被隐藏面板隔断时索引错位） */
const resizeAId = ref<PanelKey | null>(null)
const resizeBId = ref<PanelKey | null>(null)

/**
 * 右侧可见面板：过滤掉未注册（禁用插件残留）的 id，
 * 避免未知面板空渲染破坏 flex 布局。携带其在 layout 中的真实索引供逻辑用。
 */
const visibleRight = computed<{ id: PanelKey; realIndex: number }[]>(() =>
  layout.rightPanels
    .map((id, realIndex) => ({ id, realIndex }))
    .filter((p) => merged.value.has(p.id)),
)

/** 给定真实索引，返回其后第一个可见面板的真实索引（含自身之后沿数组找）；无则 -1 */
function nextVisibleIndex(fromRealIndex: number): number {
  for (let i = fromRealIndex + 1; i < layout.rightPanels.length; i++) {
    if (merged.value.has(layout.rightPanels[i])) return i
  }
  return -1
}

/** 右侧是否为空（按可见面板判断，全被隐藏则显示空态） */
const rightEmpty = computed(() => visibleRight.value.length === 0)

/** 重置本地拖拽指示状态 */
function resetDrag(): void {
  dragSource.value = null
  dragOverIndex.value = null
}

/** DockPanel 拖拽起始（同容器内） */
function onPanelDragStart(panelId: PanelKey, ev: DragEvent): void {
  dragSource.value = { panelId, from: 'right' }
  writePanelDrag(ev, { panelId, from: 'right' })
}

/** 面板条目 dragover：允许 drop 并记录 hover 索引 */
function onPanelDragOver(index: number, e: DragEvent): void {
  e.preventDefault()
  if (dragSource.value && dragSource.value.panelId !== layout.rightPanels[index]) {
    dragOverIndex.value = index
  }
}

function onPanelDrop(index: number, e: DragEvent): void {
  e.preventDefault()
  e.stopPropagation()
  const payload = readPanelDrag(e)
  if (!payload) {
    resetDrag()
    return
  }
  if (payload.from === 'right') {
    const fromIndex = layout.rightPanels.indexOf(payload.panelId)
    if (fromIndex >= 0 && fromIndex !== index) layout.reorderRight(fromIndex, index)
  } else {
    layout.moveToRight(payload.panelId, index)
  }
  resetDrag()
}

/** 容器级 drop（空隙 / resize handle / 空态）→ 追加到末尾 */
function onContainerDrop(e: DragEvent): void {
  e.preventDefault()
  const payload = readPanelDrag(e)
  if (!payload) {
    resetDrag()
    return
  }
  const toIndex = layout.rightPanels.length
  if (payload.from === 'right') {
    const fromIndex = layout.rightPanels.indexOf(payload.panelId)
    if (fromIndex >= 0) layout.reorderRight(fromIndex, toIndex)
  } else {
    layout.moveToRight(payload.panelId, toIndex)
  }
  resetDrag()
}

/** 全局 dragend 兜底：结束任何拖拽指示 */
useEventListener('dragend', resetDrag)

// ── resize handle（pointer events） ──

/** 相邻两块面板的最小 flex */
const MIN_FLEX = 0.1

function onResizeDown(index: number, e: PointerEvent): void {
  const a = layout.rightPanels[index]
  const nextIdx = nextVisibleIndex(index)
  const b = nextIdx >= 0 ? layout.rightPanels[nextIdx] : undefined
  if (!a || !b) return
  const flexA = layout.rightSizes[a] ?? 1
  const flexB = layout.rightSizes[b] ?? 1
  resizeIndex.value = index
  resizeAId.value = a
  resizeBId.value = b
  resizeStartY.value = e.clientY
  resizeStartB.value = flexB
  resizeTotal.value = flexA + flexB
  // 像素 → flex 比例：flex 总量 / 容器像素高度
  const totalFlex = layout.rightPanels.reduce(
    (sum, id) => sum + (layout.rightSizes[id] ?? 1),
    0,
  )
  const h = containerEl.value?.clientHeight ?? 0
  resizeScale.value = h > 0 ? totalFlex / h : 1
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

/** 移动：保持相邻两块 flex 之和不变，按 delta 分配 */
useEventListener('pointermove', (e: PointerEvent) => {
  const i = resizeIndex.value
  if (i === null) return
  const a = resizeAId.value
  const b = resizeBId.value
  if (!a || !b) return
  const deltaPx = e.clientY - resizeStartY.value
  const flexDelta = deltaPx * resizeScale.value
  const sum = resizeTotal.value
  // 分隔条下移 → 上方面板（a）增大、下方（b）减小；保证两者都不小于 MIN_FLEX
  const newB = Math.min(sum - MIN_FLEX, Math.max(MIN_FLEX, resizeStartB.value - flexDelta))
  const newA = sum - newB
  layout.setRightSize(b, newB)
  layout.setRightSize(a, newA)
})

/** 松开结束 resize */
useEventListener('pointerup', () => {
  resizeIndex.value = null
  resizeAId.value = null
  resizeBId.value = null
})

/** 面板关闭 → 从 dock 移除（回未放置状态） */
function onPanelClose(panelId: PanelKey): void {
  layout.removePanel(panelId)
}
</script>

<template>
  <div
    ref="containerEl"
    class="dock-container"
    @dragover.prevent
    @drop="onContainerDrop"
  >
    <template v-if="!rightEmpty">
      <template v-for="(item, vi) in visibleRight" :key="item.id">
        <div
          class="dock-item"
          :class="{
            'is-dragging': dragSource?.panelId === item.id,
            'is-drag-over':
              dragOverIndex === item.realIndex &&
              dragSource !== null &&
              dragSource.panelId !== item.id,
          }"
          :style="{ flex: layout.rightSizes[item.id] ?? 1, minHeight: 0 }"
          @dragover="onPanelDragOver(item.realIndex, $event)"
          @drop="onPanelDrop(item.realIndex, $event)"
          @dragenter.prevent="dragOverIndex = item.realIndex"
        >
          <DockPanel
            :panel-id="item.id"
            @drag-start="onPanelDragStart"
            @close="onPanelClose"
          />
        </div>
        <!-- 面板间 resize handle -->
        <div
          v-if="vi < visibleRight.length - 1"
          class="dock-resize"
          :class="{ active: resizeIndex === item.realIndex }"
          @pointerdown="onResizeDown(item.realIndex, $event)"
        />
      </template>
    </template>

    <!-- 空态：仍作为 drop zone 接收左侧面板 -->
    <div v-else class="dock-empty">
      {{ t('dock.panelEmpty') }}
    </div>
  </div>
</template>

<style scoped>
.dock-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.dock-item {
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
}

.dock-item.is-dragging {
  opacity: 0.35;
}

/* 目标面板顶部指示条（仿 DraggableSortList） */
.dock-item.is-drag-over::before {
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

.dock-resize {
  height: 6px; /* 抓取区域略宽 */
  cursor: row-resize;
  flex-shrink: 0;
  position: relative;
  background: transparent;
}

/* 始终可见的细分隔线 */
.dock-resize::before {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  height: 1px;
  background: var(--color-border);
  transition: height 0.15s ease, background-color 0.15s ease;
}

/* 悬停 / 拖拽：加粗并高亮为主色 */
.dock-resize:hover::before,
.dock-resize.active::before {
  height: 3px;
  background: var(--color-primary);
}

.dock-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 13px;
  min-height: 48px;
  user-select: none;
}
</style>