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
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import NodePropertyEditor from './NodePropertyEditor.vue'
import ConnectionPropertyEditor from './ConnectionPropertyEditor.vue'
import PresetStyles from './PresetStyles.vue'

const active = useActiveWhiteboard()

defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

/** 当前是否有任何选中项（节点或连线） */
const hasSelection = computed(
  () => active.board.selectedNodeIds.size > 0 || active.board.selectedConnectionIds.size > 0,
)

/** 标题文本 */
const title = computed(() => {
  if (active.board.selectedConnectionIds.size > 0) return '连线属性'
  return '属性'
})
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
      <span v-if="!collapsed" class="sidebar-title">{{ title }}</span>
    </div>

    <template v-if="!collapsed">
      <NScrollbar class="sidebar-scroll">
        <div class="sidebar-content">
          <!-- 连线选中 → 连线属性编辑器 + 预设样式 -->
          <template v-if="active.board.selectedConnectionIds.size > 0">
            <ConnectionPropertyEditor />
            <PresetStyles v-if="hasSelection" />
          </template>
          <!-- 节点选中或无选中 → 节点属性编辑器 + 预设样式 -->
          <template v-else>
            <NodePropertyEditor />
            <PresetStyles v-if="hasSelection" />
          </template>
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
