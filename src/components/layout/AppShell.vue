<script setup lang="ts">
/**
 * AppShell — 应用布局外壳
 *
 * 布局结构：
 *   ┌──────── 顶部图标条（MenuBar 左 │ Toolbar 右）─────────┐
 *   ├ ActivityBar ┬ LeftSidebar ┬ Canvas ┬ RightSidebar ┤
 *   └─────────────┴────────────┴────────┴───────────────┘
 *
 * 左侧：活动栏（ActivityBar，始终可见）+ 面板区（LeftSidebar，渲染激活面板）。
 * 面板区收起状态由 layout store 驱动。
 *
 * 拖拽调整侧边栏宽度：
 * - 左右侧边栏边缘有可拖拽的 resize handle
 * - 宽度范围：180px ~ 440px
 * - 收起态下 handle 隐藏
 */
import { ref, computed, provide } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useDialog } from 'naive-ui'
import { useLayoutStore } from '@/stores/layout'
import { useFileStore } from '@/stores/file'
import { useViewStore } from '@/stores/view'
import { useProjectFile } from '@/composables/useProjectFile'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { t } from '@/composables/useT'
import MenuBar from './MenuBar.vue'
import ActivityBar from './ActivityBar.vue'
import LeftSidebar from './LeftSidebar.vue'
import RightSidebar from './RightSidebar.vue'
import SettingsModal from '@/components/settings/SettingsModal.vue'
import Toolbar from '@/components/toolbar/Toolbar.vue'
import TabBar from './TabBar.vue'
import WhiteboardCanvas from '@/components/canvas/WhiteboardCanvas.vue'
import FloatingPropertyEditor from '@/components/floating/FloatingPropertyEditor.vue'
import FloatingAIWordPanel from '@/components/floating/FloatingAIWordPanel.vue'
import FloatingAIWordStrip from '@/components/floating/FloatingAIWordStrip.vue'
import { useAIWordPanel } from '@/composables/useAIWordPanel'

// ── 侧边栏收起状态 ──
const layout = useLayoutStore()
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

// ── 项目文件（新建 / 保存 / 打开）──
const dialog = useDialog()
const fileStore = useFileStore()

/** 确认回调：返回 true 表示确认放弃，false 表示取消 */
function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.warning({
      title: message,
      positiveText: t('common.confirm'),
      negativeText: t('common.cancel'),
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false),
      onMaskClick: () => resolve(false),
    })
  })
}

// 单实例创建并注入，MenuBar 等子孙组件通过 inject 共享同一状态
const projectFile = useProjectFile({ confirm })
provide('projectFile', projectFile)

// ── 键盘快捷键（全局单份，含文件快捷键）──
const isEditing = computed(() => useViewStore('main').editingNodeId !== null)
const { displayMode } = useAIWordPanel()
useKeyboardShortcuts(isEditing, projectFile)

// ── 关闭 / 刷新前脏提示 ──
useEventListener('beforeunload', (e: BeforeUnloadEvent) => {
  if (fileStore.dirty) {
    e.preventDefault()
    e.returnValue = ''
  }
})
</script>

<template>
  <div class="app-shell">
    <!-- 顶部图标条：左侧菜单栏分区 + 右侧工具栏分区，左右两端分开但共用同一图标视觉语言 -->
    <div class="top-bar">
      <MenuBar @open-settings="showSettings = true" />
      <Toolbar />
    </div>

    <!-- 主体区域 -->
    <div class="app-body">
      <!-- 左侧活动栏（始终可见） -->
      <ActivityBar />

      <!-- 左侧面板区 -->
      <LeftSidebar
        :collapsed="layout.collapsed"
        :width="leftWidth"
        :resizing="leftResizing"
      />

      <!-- 左侧 resize handle（收起态隐藏） -->
      <div
        v-if="!layout.collapsed"
        class="resize-handle"
        :class="{ active: isDraggingLeft }"
        @pointerdown="startDragLeft"
      />

      <!-- 中央画布区域 -->
      <div class="app-center">
        <!-- 多标签页栏：位于画布之上的一条横向栏 -->
        <TabBar />
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

    <!-- 浮动属性编辑器（全局单实例挂载） -->
    <FloatingPropertyEditor />

    <!-- AI 生成词：按 displayMode 二选一渲染（全局单实例挂载） -->
    <FloatingAIWordStrip v-if="displayMode === 'strip'" />
    <FloatingAIWordPanel v-else />
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

/* 顶部图标条：承载左（MenuBar）右（Toolbar）两个图标分区 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  flex-shrink: 0;
  padding: 0 8px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  user-select: none;
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
