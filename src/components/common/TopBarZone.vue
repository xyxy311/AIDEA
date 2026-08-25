<script setup lang="ts">
/**
 * TopBarZone - 顶部栏通用容器（左 / 右共用）
 *
 * 模仿左侧活动栏 ActivityBar 的图标渲染 + 拖拽排序：
 * - 按 layout store 的某侧按钮顺序（leftTop / rightTop）渲染已注册按钮，
 *   按钮逻辑与图标由品类表 constants/topbar.ts 的 component 提供（外壳为 TopBarButton 模板）
 * - 同侧拖拽排序：HTML5 drag，drop 后调 layout.reorderTop
 * - 跨侧放置：从另一侧拖入本容器 → layout.moveTopZone（追加到末尾）；
 *   dragstart 置 suppressClick、dragend 用 setTimeout(0) 复位，抑制拖拽后误触点击
 *
 * LeftTopBar / RightTopBar 是薄封装，各自以固定 zone 引用本容器。
 */
import { computed, ref } from 'vue'
import { useLayoutStore } from '@/stores/layout'
import { TOP_BAR_INDEX } from '@/constants/topbar'
import type { TopBarId, TopBarZone } from '@/constants/topbar'
import { writeTopBarDrag, readTopBarDrag } from '@/utils/topbar'

const props = defineProps<{
  zone: TopBarZone
}>()

const layout = useLayoutStore()

/** 本侧已放置按钮 id（按 store 顺序，响应式） */
const orderedIds = computed<TopBarId[]>(() =>
  props.zone === 'left' ? layout.leftTop : layout.rightTop,
)

/** 本侧是否为空（用于空态提示） */
const empty = computed(() => orderedIds.value.length === 0)

// ── 同侧拖拽排序状态 ──
const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)
/** 拖拽刚结束时抑制紧随其后的 click，避免误触按钮动作 */
const suppressClick = ref(false)
/** 跨侧投放时，本容器整体高亮为可接收目标 */
const isDropTarget = ref(false)

function onDragStart(index: number, buttonId: TopBarId, e: DragEvent): void {
  dragIndex.value = index
  suppressClick.value = true
  // 写入统一跨侧拖拽协议，供另一侧容器接收本按钮
  writeTopBarDrag(e, { buttonId, zone: props.zone })
}

function onDragOver(index: number, e: DragEvent): void {
  e.preventDefault()
  if (dragIndex.value !== null && dragIndex.value !== index) {
    dropIndex.value = index
  }
}

function onDrop(index: number, e: DragEvent): void {
  e.preventDefault()
  // 仅处理本侧内换位；跨侧投放由容器 drop 统一处理
  if (dragIndex.value !== null) {
    layout.reorderTop(props.zone, dragIndex.value, index)
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

/** 拖拽刚结束时捕获吞掉随后的 click，避免误触按钮动作 */
function onItemClick(e: MouseEvent): void {
  if (suppressClick.value) {
    e.stopPropagation()
    e.preventDefault()
  }
}

// ── 本容器作为跨侧投放目标（接收来自另一侧顶部的按钮）──
function onContainerDragOver(e: DragEvent): void {
  const data = readTopBarDrag(e)
  isDropTarget.value = !!data && data.zone !== props.zone
}

function onContainerDrop(e: DragEvent): void {
  const data = readTopBarDrag(e)
  if (data && data.zone !== props.zone) {
    layout.moveTopZone(data.buttonId, props.zone)
  }
  isDropTarget.value = false
  endDrag()
}

function onContainerDragLeave(): void {
  isDropTarget.value = false
}
</script>

<template>
  <div
    class="top-zone"
    :class="{ 'is-drop-target': isDropTarget, 'is-empty': empty }"
    @dragover.prevent="onContainerDragOver"
    @drop.prevent="onContainerDrop"
    @dragleave="onContainerDragLeave"
  >
    <template v-for="(id, index) in orderedIds" :key="id">
      <div
        class="top-item"
        :class="{
          'is-dragging': dragIndex === index,
          'is-drop-target': dropIndex === index && dragIndex !== null && dragIndex !== index,
        }"
        :draggable="true"
        @click.capture="onItemClick"
        @dragstart.stop="onDragStart(index, id, $event)"
        @dragenter.prevent="dropIndex = index"
        @dragover.prevent="onDragOver(index, $event)"
        @dragleave="dropIndex === index && (dropIndex = null)"
        @drop.prevent="onDrop(index, $event)"
        @dragend="onDragEnd"
      >
        <component :is="TOP_BAR_INDEX[id].component" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.top-zone {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 6px;
}

/* 拖拽中的被拖项：半透明 */
.top-item.is-dragging {
  opacity: 0.4;
}

/* 拖拽悬停目标：左侧指示条 */
.top-item.is-drop-target::after {
  content: '';
  position: absolute;
  left: -3px;
  top: 4px;
  bottom: 4px;
  width: 3px;
  border-radius: 2px;
  background: var(--color-primary);
}

.top-item {
  position: relative;
  display: flex;
  align-items: center;
}

/* 从另一侧拖入时的容器高亮：整段描边提示可投放 */
.top-zone.is-drop-target {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
  border-radius: 8px;
}

/* 空态：保留最小占位，避免容器塌缩（拖入仍可投放） */
.top-zone.is-empty {
  min-width: 24px;
  min-height: 32px;
}
</style>