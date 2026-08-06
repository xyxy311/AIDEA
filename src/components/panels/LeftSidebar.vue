<script setup lang="ts">
/**
 * LeftSidebar - 左侧面板容器
 *
 * 通用面板容器：根据 layout store 的激活面板，渲染对应面板组件
 * （节点树 / 引用等，见 constants/panels.ts 的 PANEL_COMPONENTS）。
 * - 无 header（更简洁）：收起/展开完全由活动栏导航控制
 * - 收起/展开由 layout store 的 activePanelId 驱动（null = 收起）
 * - 每个面板组件内部自带标题栏
 */
import { computed } from 'vue'
import { useLayoutStore } from '@/stores/layout'
import { PANEL_COMPONENTS } from '@/constants/panels'

defineProps<{
  collapsed: boolean
  width: number
  resizing: boolean
}>()

const layout = useLayoutStore()

/** 激活面板的渲染组件（收起时为 null） */
const activeComponent = computed(
  () => (layout.activeId ? PANEL_COMPONENTS[layout.activeId] : null),
)
</script>

<template>
  <div
    class="sidebar-left"
    :class="{ collapsed, resizing }"
    :style="{ width: collapsed ? '0px' : width + 'px' }"
  >
    <!-- 渲染激活面板组件（面板内部自带标题栏，收起时不渲染） -->
    <component :is="activeComponent" v-if="activeComponent && !collapsed" />
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