<script setup lang="ts">
/**
 * RightSidebar — 右侧边栏
 *
 * 选中节点时显示属性编辑器 + 预设样式。
 * 支持收起/展开。
 */
import { NButton, NScrollbar, NText } from 'naive-ui'
import { ChevronBack, ChevronForward } from '@vicons/ionicons5'
import NodePropertyEditor from './NodePropertyEditor.vue'
import PresetStyles from './PresetStyles.vue'

defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <div class="sidebar-right" :class="{ collapsed }">
    <div class="sidebar-header">
      <NButton size="tiny" quaternary @click="emit('toggle')">
        <template #icon>
          <ChevronForward v-if="!collapsed" />
          <ChevronBack v-else />
        </template>
      </NButton>
      <span v-if="!collapsed" class="sidebar-title">属性</span>
    </div>

    <template v-if="!collapsed">
      <NScrollbar class="sidebar-scroll">
        <div class="sidebar-content">
          <NodePropertyEditor />
          <PresetStyles />
        </div>
      </NScrollbar>
    </template>
  </div>
</template>

<style scoped>
.sidebar-right {
  width: 240px;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  flex-shrink: 0;
  transition: width 0.2s;
  overflow: hidden;
}

.sidebar-right.collapsed {
  width: 36px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 8px;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  margin-right: 8px;
}

.sidebar-scroll {
  flex: 1;
}

.sidebar-content {
  padding: 8px 12px;
}
</style>
