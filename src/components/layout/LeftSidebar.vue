<script setup lang="ts">
/**
 * LeftSidebar - 左侧面板容器（单面板区）
 *
 * 通用面板容器：根据 layout store 的激活面板，渲染对应面板。
 * 面板统一由 DockPanel 外壳包裹（标题栏 / 图标 / 关闭 / 拖拽手柄），
 * 面板内容组件由品类表 PANEL_INDEX 提供，本组件不持有面板业务。
 * - 收起/展开由 layout store 的 activePanelId 驱动（null = 收起）
 * - 关闭：把面板移回「未放置」并收起左侧面板区
 * - 拖拽：把手柄拖到右侧 dock 即跨容器移动（dataTransfer 协议见 utils/dock）
 */
import { computed } from 'vue'
import { useLayoutStore } from '@/stores/layout'
import { writePanelDrag, type PanelDragData } from '@/utils/dock'
import type { PanelId } from '@/constants/panels'
import DockPanel from '@/components/common/DockPanel.vue'

defineProps<{
  collapsed: boolean
  width: number
  resizing: boolean
}>()

const layout = useLayoutStore()

/** 激活面板 id（收起时为 null） */
const activeId = computed(() => layout.activeId)

/** 关闭按钮：把面板移出回未放置（removePanel 会同时收起左侧面板区） */
function onClose(panelId: PanelId): void {
  layout.removePanel(panelId)
}

/** 拖拽手柄启动：写入跨容器拖拽协议（from='left'） */
function onDragStart(panelId: PanelId, e: DragEvent): void {
  writePanelDrag(e, { panelId, from: 'left' } satisfies PanelDragData)
}
</script>

<template>
  <div
    class="sidebar-left"
    :class="{ collapsed, resizing }"
    :style="{ width: collapsed ? '0px' : width + 'px' }"
  >
    <!-- 激活面板：DockPanel 统一外壳（收起时不渲染） -->
    <DockPanel
      v-if="activeId && !collapsed"
      class="sidebar-panel"
      :panel-id="activeId"
      @close="onClose"
      @drag-start="onDragStart"
    />
  </div>
</template>

<style scoped>
.sidebar-left {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  flex-shrink: 0;
  transition: width 0.2s;
  overflow: hidden;
}

/* DockPanel 撑满侧边栏高度 */
.sidebar-panel {
  flex: 1;
  min-height: 0;
}

/* 拖拽中禁用 transition，避免卡顿/回弹 */
.sidebar-left.resizing {
  transition: none !important;
}

/* 收起 = 完全隐藏（宽度 0，无边框），由活动栏控制展开 */
.sidebar-left.collapsed {
  width: 0 !important; /* !important 覆盖 inline style */
  border-right: none;
}
</style>