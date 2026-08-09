<script setup lang="ts">
/**
 * RightSidebar — 右侧多面板 dock 容器外壳
 *
 * 保留「收起/展开 + 宽度」外壳，内容区渲染 DockContainer。
 * 面板的标题 / 拖拽换位 / resize / 关闭均由 DockContainer 及各面板自身处理。
 */
import { NButton } from 'naive-ui'
import { ChevronBack, ChevronForward } from '@vicons/ionicons5'
import DockContainer from '@/components/common/DockContainer.vue'

defineProps<{
  collapsed: boolean
  width: number
  resizing: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <div
    class="sidebar-right"
    :class="{ collapsed, resizing }"
    :style="{ width: collapsed ? '36px' : width + 'px' }"
  >
    <div class="sidebar-header">
      <NButton size="tiny" quaternary @click="emit('toggle')">
        <template #icon>
          <ChevronForward v-if="!collapsed" />
          <ChevronBack v-else />
        </template>
      </NButton>
    </div>

    <div v-if="!collapsed" class="sidebar-body">
      <DockContainer />
    </div>
  </div>
</template>

<style scoped>
.sidebar-right {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  flex-shrink: 0;
  transition: width 0.2s;
  overflow: hidden;
}

/* 拖拽中禁用 transition */
.sidebar-right.resizing {
  transition: none !important;
}

.sidebar-right.collapsed {
  width: 36px !important;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.sidebar-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>