<script setup lang="ts">
/**
 * AppShell — 应用布局外壳
 *
 * 布局结构：
 *   ┌────── 顶部图标条（LeftTopBar 左 │ TabBar 中 │ RightTopBar 右）──────┐
 *   ├ ActivityBar ┬ LeftSidebar ┬ Canvas ┬ RightSidebar ┤
 *   └─────────────┴────────────┴────────┴───────────────┘
 *
 * 左侧：活动栏（ActivityBar，始终可见）+ 面板区（LeftSidebar，渲染激活面板）。
 * 面板区收起状态由 layout store 驱动。
 *
 * 顶部左/右图标按钮条（LeftTopBar / RightTopBar）：按钮经 constants/topbar.ts
 * 品类表注册，可拖拽排序与跨区放置（状态由 layout store 管理）。
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
import LeftTopBar from './LeftTopBar.vue'
import ActivityBar from './ActivityBar.vue'
import LeftSidebar from './LeftSidebar.vue'
import RightSidebar from './RightSidebar.vue'
import SettingsModal from '@/components/settings/SettingsModal.vue'
import RightTopBar from '@/components/layout/RightTopBar.vue'
import TabBar from './TabBar.vue'
import WheelScroll from '@/components/common/WheelScroll.vue'
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

// 单实例创建并注入，各按钮组件等子孙组件通过 inject 共享同一状态
const projectFile = useProjectFile({ confirm })
provide('projectFile', projectFile)

// 设置按钮注入：打开设置弹窗
provide('openSettings', () => {
  showSettings.value = true
})

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
    <!-- 顶部图标条：左(LeftTopBar)│中(多标签页栏)│右(RightTopBar)三区，分隔条隔开，各自滚轮横向滚动 -->
    <div class="top-bar">
      <!-- 左区：左顶部按钮条（WheelScroll 滚轮滚动，隐藏滚动条） -->
      <div class="top-section top-left">
        <WheelScroll>
          <LeftTopBar />
        </WheelScroll>
      </div>

      <div class="top-divider" />

      <!-- 中区：多标签页栏（定宽居中，标签带滚轮滚动 + 右端覆盖式新增按钮） -->
      <div class="top-section top-center">
        <TabBar />
      </div>

      <div class="top-divider" />

      <!-- 右区：右顶部按钮条（WheelScroll 滚轮滚动，隐藏滚动条，整体右对齐） -->
      <div class="top-section top-right">
        <WheelScroll>
          <RightTopBar />
        </WheelScroll>
      </div>
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

/* 顶部图标条：左(菜单栏) │ 中(多标签栏) │ 右(工具栏) 三区，以分隔条隔开 */
.top-bar {
  display: flex;
  align-items: center;
  height: 44px;
  flex-shrink: 0;
  padding: 0;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  user-select: none;
}

/* 三区共通：撑满高度、允许内容横向溢出（交给 WheelScroll 滚轮滚动） */
.top-section {
  display: flex;
  align-items: center;
  height: 100%;
  min-width: 0;
}

/* 左区：菜单栏，占用左右剩余空间的左侧部分 */
.top-left {
  flex: 1;
  padding-left: 8px;
}

.top-left :deep(.wheel-scroll) {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

/* 中区：多标签页栏——固定宽度（标签过多时内部滚轮滚动 + 右端覆盖式新增按钮） */
.top-center {
  flex: 0 0 50%;
  align-items: stretch; /* 覆盖 .top-section 的居中，让 TabBar 占满中段全高 */
}

/* 右区：右顶部按钮条，占用左右剩余空间的右侧部分，整体右对齐 */
.top-right {
  flex: 1;
  justify-content: flex-end;
  padding-right: 8px;
}

.top-right :deep(.wheel-scroll) {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

/* 空间充足时右顶部条整体靠右；溢出时（滚轮滚动态）自动退化为可滚的左对齐内容 */
.top-right :deep(.right-top-bar) {
  margin-left: auto;
}

/* 分隔条：三区之间的竖向分隔线 */
.top-divider {
  width: 1px;
  height: 24px;
  flex-shrink: 0;
  background: var(--color-border);
  margin: 0 8px;
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
