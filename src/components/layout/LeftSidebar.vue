<script setup lang="ts">
/**
 * LeftSidebar - 左侧面板容器（单面板区）：按 layout store 激活面板渲染对应面板，
 * 统一由 DockPanel 外壳包裹（标题/图标/关闭/拖拽手柄），内容组件靠品类表提供。
 * 关闭 = 收起面板区（保留活动栏图标）；把手柄拖到右侧 dock 即跨容器移动。
 */
import { computed } from 'vue'
import { useLayoutStore } from '@/stores/layout'
import { writePanelDrag, type PanelDragData } from '@/utils/dock'
import type { PanelKey } from '@/constants/panels'
import { t } from '@/composables/useT'
import DockPanel from '@/components/common/DockPanel.vue'

defineProps<{
  collapsed: boolean
  width: number
  resizing: boolean
}>()

const layout = useLayoutStore()

/** 激活面板 id（收起时为 null，可为插件面板 key） */
const activeId = computed(() => layout.activeId)

/** 关闭：收起左侧面板区（活动栏图标保留，面板不移除） */
function onClose(): void {
  layout.collapse()
}

/** 拖拽手柄启动：写入跨容器拖拽协议（from='left'） */
function onDragStart(panelId: PanelKey, e: DragEvent): void {
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
      :close-hint="t('dock.collapsePanel')"
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