<script setup lang="ts">
/**
 * RightSidebar — 右侧边栏
 *
 * 选中节点时显示节点属性编辑器 + 预设样式。
 * 选中连线时显示连线属性编辑器 + 预设样式。
 * 支持收起/展开。
 */
import { computed } from 'vue'
import { NButton, NScrollbar, NText } from 'naive-ui'
import { ChevronBack, ChevronForward } from '@vicons/ionicons5'
import { t } from '@/composables/useT'
import { useActiveView } from '@/composables/useActiveView'
import NodePropertyEditor from './NodePropertyEditor.vue'
import ConnectionPropertyEditor from './ConnectionPropertyEditor.vue'

const active = useActiveView()

defineProps<{
  collapsed: boolean
  width: number
  resizing: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

/** 标题文本 */
const title = computed(() => {
  if (active.view.selectedConnectionIds.size > 0) return t('rightSidebar.connectionProps')
  return t('rightSidebar.nodeProps')
})
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
      <span v-if="!collapsed" class="sidebar-title">{{ title }}</span>
    </div>

    <template v-if="!collapsed">
      <NScrollbar class="sidebar-scroll">
        <div class="sidebar-content">
          <!-- 连线选中 → 连线属性编辑器（含预设） -->
          <template v-if="active.view.selectedConnectionIds.size > 0">
            <ConnectionPropertyEditor />
          </template>
          <!-- 节点选中或无选中 → 节点属性编辑器（含预设） -->
          <template v-else>
            <NodePropertyEditor />
          </template>
        </div>
      </NScrollbar>
    </template>
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
