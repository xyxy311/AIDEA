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
 * 状态全部来自 layout store，本组件不持有布局数据。
 */
import { ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useLayoutStore } from '@/stores/layout'
import { PANEL_REGISTRY, PANEL_COMPONENTS, type PanelId } from '@/constants/panels'
import { t } from '@/composables/useT'
import DockPanel from './DockPanel.vue'

/** 跨容器拖拽数据 MIME 类型（全项目统一协议） */
const IDS = 'aidea-panel'

const layout = useLayoutStore()

/** 容器根元素（用于测量高度换算 flex） */
const containerEl = ref<HTMLElement | null>(null)

// ── 拖拽换位状态 ──
interface DragSource {
  panelId: PanelId
  from: 'left' | 'right'
}
/** 当前拖拽源信息（仅同容器内拖拽时在本地维护；跨容器靠 dataTransfer） */
const dragSource = ref<DragSource | null>(null)
/** 当前 hover 的目标面板索引（用于指示条） */
const dragOverIndex = ref<number | null>(null)

// ── resize 状态 ──
const resizeIndex = ref<number | null>(null)
const resizeStartY = ref(0)
const resizeStartB = ref(1)
const resizeTotal = ref(2)
const resizeScale = ref(1)

/** 读取 dataTransfer 中的统一拖拽信息，容错返回 null */
function readDrag(e: DragEvent): DragSource | null {
  const raw = e.dataTransfer?.getData(IDS)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DragSource
    if (parsed && typeof parsed.panelId === 'string') return parsed
    return null
  } catch {
    return null
  }
}

/** 重置本地拖拽指示状态 */
function resetDrag(): void {
  dragSource.value = null
  dragOverIndex.value = null
}

/** DockPanel 拖拽起始（同容器内） */
function onPanelDragStart(panelId: PanelId, ev: DragEvent): void {
  dragSource.value = { panelId, from: 'right' }
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = 'move'
    ev.dataTransfer.setData(IDS, JSON.stringify({ panelId, from: 'right' }))
  }
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
  const payload = readDrag(e)
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
  const payload = readDrag(e)
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
  const panels = layout.rightPanels
  const a = panels[index]
  const b = panels[index + 1]
  if (!a || !b) return
  const flexA = layout.rightSizes[a] ?? 1
  const flexB = layout.rightSizes[b] ?? 1
  resizeIndex.value = index
  resizeStartY.value = e.clientY
  resizeStartB.value = flexB
  resizeTotal.value = flexA + flexB
  // 像素 → flex 比例：flex 总量 / 容器像素高度
  const totalFlex = panels.reduce((sum, id) => sum + (layout.rightSizes[id] ?? 1), 0)
  const h = containerEl.value?.clientHeight ?? 0
  resizeScale.value = h > 0 ? totalFlex / h : 1
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

/** 移动：保持相邻两块 flex 之和不变，按 delta 分配 */
useEventListener('pointermove', (e: PointerEvent) => {
  const i = resizeIndex.value
  if (i === null) return
  const panels = layout.rightPanels
  const a = panels[i]
  const b = panels[i + 1]
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
})

/** 解析面板标题：property 面板统一用「属性」，其余取注册表 titleKey */
function resolveTitle(id: PanelId): string {
  if (id === 'property') {
    return t('rightSidebar.property')
  }
  const meta = PANEL_REGISTRY.find((p) => p.id === id)
  return meta ? t(meta.titleKey) : id
}

/** 面板关闭 → 从 dock 移除 */
function onPanelClose(panelId: PanelId): void {
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
    <template v-if="layout.rightPanels.length > 0">
      <template v-for="(id, index) in layout.rightPanels" :key="id">
        <div
          class="dock-item"
          :class="{
            'is-dragging': dragSource?.panelId === id,
            'is-drag-over':
              dragOverIndex === index &&
              dragSource !== null &&
              dragSource.panelId !== id,
          }"
          :style="{ flex: layout.rightSizes[id] ?? 1, minHeight: 0 }"
          @dragover="onPanelDragOver(index, $event)"
          @drop="onPanelDrop(index, $event)"
          @dragenter.prevent="dragOverIndex = index"
        >
          <DockPanel
            :panel-id="id"
            :title="resolveTitle(id)"
            @drag-start="onPanelDragStart"
            @close="onPanelClose"
          >
            <component
              :is="PANEL_COMPONENTS[id]"
              :hide-header="id !== 'property'"
            />
          </DockPanel>
        </div>
        <!-- 面板间 resize handle -->
        <div
          v-if="index < layout.rightPanels.length - 1"
          class="dock-resize"
          :class="{ active: resizeIndex === index }"
          @pointerdown="onResizeDown(index, $event)"
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