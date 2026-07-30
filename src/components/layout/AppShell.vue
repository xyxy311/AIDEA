<script setup lang="ts">
/**
 * AppShell — 应用布局外壳
 *
 * 布局结构：
 *   ┌─────────────── MenuBar ───────────────┐
 *   ├─ LeftSidebar ─┬─ Toolbar ─┬─ RightSB ─┤
 *   │               ├─ Canvas ──┤           │
 *   └───────────────┴───────────┴───────────┘
 *
 * 拖拽调整侧边栏宽度：
 * - 左右侧边栏边缘有可拖拽的 resize handle
 * - 宽度范围：180px ~ 440px
 * - 收起态下 handle 隐藏
 */
import { ref, computed } from 'vue'
import { useEventListener } from '@vueuse/core'
import MenuBar from './MenuBar.vue'
import LeftSidebar from '@/components/panels/LeftSidebar.vue'
import RightSidebar from '@/components/panels/RightSidebar.vue'
import SettingsModal from '@/components/panels/SettingsModal.vue'
import Toolbar from '@/components/toolbar/Toolbar.vue'
import WhiteboardCanvas from '@/components/canvas/WhiteboardCanvas.vue'

// ── 侧边栏收起状态 ──
const leftCollapsed = ref(false)
const rightCollapsed = ref(false)

// ── 侧边栏宽度（默认值与 CSS 保持一致） ──
const leftWidth = ref(220)
const rightWidth = ref(240)

// ── 拖拽状态 ──
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 440
const isDraggingLeft = ref(false)
const isDraggingRight = ref(false)
const dragStartX = ref(0)
const dragStartLeftWidth = ref(220)
const dragStartRightWidth = ref(240)

/** 左侧拖拽中 → 禁用 transition */
const leftResizing = computed(() => isDraggingLeft.value)
/** 右侧拖拽中 → 禁用 transition */
const rightResizing = computed(() => isDraggingRight.value)

// ── 拖拽逻辑（pointer events） ──

function startDragLeft(e: PointerEvent): void {
  isDraggingLeft.value = true
  dragStartX.value = e.clientX
  dragStartLeftWidth.value = leftWidth.value
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

function startDragRight(e: PointerEvent): void {
  isDraggingRight.value = true
  dragStartX.value = e.clientX
  dragStartRightWidth.value = rightWidth.value
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

/** 鼠标移动时实时更新宽度 */
useEventListener('pointermove', (e: PointerEvent) => {
  if (isDraggingLeft.value) {
    const delta = e.clientX - dragStartX.value
    leftWidth.value = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, dragStartLeftWidth.value + delta),
    )
  }
  if (isDraggingRight.value) {
    const delta = e.clientX - dragStartX.value
    // 右侧 handle 在边栏左边缘：鼠标右移 → 边栏变窄（delta 正 → 宽度减）
    rightWidth.value = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, dragStartRightWidth.value - delta),
    )
  }
})

/** 松开停止拖拽 */
useEventListener('pointerup', () => {
  isDraggingLeft.value = false
  isDraggingRight.value = false
})

const showSettings = ref(false)
</script>

<template>
  <div class="app-shell">
    <!-- 菜单栏 -->
    <MenuBar @open-settings="showSettings = true" />

    <!-- 主体区域 -->
    <div class="app-body">
      <!-- 左侧边栏 -->
      <LeftSidebar
        :collapsed="leftCollapsed"
        :width="leftWidth"
        :resizing="leftResizing"
        @toggle="leftCollapsed = !leftCollapsed"
      />

      <!-- 左侧 resize handle（收起态隐藏） -->
      <div
        v-if="!leftCollapsed"
        class="resize-handle"
        :class="{ active: isDraggingLeft }"
        @pointerdown="startDragLeft"
      />

      <!-- 中央画布区域 -->
      <div class="app-center">
        <Toolbar />
        <main class="app-main">
          <WhiteboardCanvas />
        </main>
      </div>

      <!-- 右侧 resize handle（收起态隐藏） -->
      <div
        v-if="!rightCollapsed"
        class="resize-handle"
        :class="{ active: isDraggingRight }"
        @pointerdown="startDragRight"
      />

      <!-- 右侧边栏 -->
      <RightSidebar
        :collapsed="rightCollapsed"
        :width="rightWidth"
        :resizing="rightResizing"
        @toggle="rightCollapsed = !rightCollapsed"
      />
    </div>

    <!-- 设置面板 -->
    <SettingsModal
      :show="showSettings"
      @close="showSettings = false"
    />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.app-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.app-main {
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* ── Resize Handle ──
 * 侧边栏与中央区域交界处的可拖拽分隔条。
 * 默认很细；hover/active 时显示一条竖线。
 */
.resize-handle {
  width: 4px;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  background: transparent;
  /* 点击区域比视觉可见区域稍宽，方便拖拽 */
  margin: 0 -1px;
}

.resize-handle::after {
  content: '';
  position: absolute;
  inset: 0;
  left: 1px;  /* 居中于 4px 宽的 handle */
  width: 2px;
  background: transparent;
  transition: background var(--transition-fast);
  pointer-events: none;
}

.resize-handle:hover::after,
.resize-handle.active::after {
  background: var(--color-border);
}
</style>
