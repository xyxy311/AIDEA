<script setup lang="ts">
/**
 * LeftSidebar — 左侧边栏：白板切换
 *
 * 展示当前项目下所有白板列表，支持：
 * - 单击切换活跃白板
 * - 双击重命名白板
 * - 新增 / 删除白板
 */
import { ref, computed, nextTick } from 'vue'
import {
  NButton,
  NInput,
  NScrollbar,
  NText,
  NPopconfirm,
} from 'naive-ui'
import { AddOutline, TrashOutline, ChevronBack, ChevronForward } from '@vicons/ionicons5'
import { useProjectStore } from '@/stores/project'

defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const store = useProjectStore()
const whiteboardList = computed(() => store.whiteboards)

// ── 重命名状态 ──
const editingWbId = ref<string | null>(null)
const renameText = ref('')

function handleAdd(): void {
  const id = store.addWhiteboard()
  store.switchWhiteboard(id)
}

function handleSwitch(id: string): void {
  if (editingWbId.value) return // 重命名中不切换
  store.switchWhiteboard(id)
}

function handleRemove(id: string): void {
  store.removeWhiteboard(id)
}

// ── 双击开始重命名 ──
function handleDblClick(wbId: string, currentName: string): void {
  editingWbId.value = wbId
  renameText.value = currentName
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.wb-rename-input input')
    input?.focus()
    input?.select()
  })
}

/** 保存重命名 */
function finishRename(): void {
  if (editingWbId.value && renameText.value.trim()) {
    store.renameWhiteboard(editingWbId.value, renameText.value)
  }
  editingWbId.value = null
}

/** 取消重命名（Escape 键） */
function cancelRename(): void {
  editingWbId.value = null
}
</script>

<template>
  <div class="sidebar-left" :class="{ collapsed }">
    <div class="sidebar-header">
      <span v-if="!collapsed" class="sidebar-title">白板列表</span>
      <NButton size="tiny" quaternary @click="emit('toggle')">
        <template #icon>
          <ChevronBack v-if="!collapsed" />
          <ChevronForward v-else />
        </template>
      </NButton>
    </div>

    <template v-if="!collapsed">
      <div class="sidebar-toolbar">
        <NButton size="small" quaternary @click="handleAdd">
          <template #icon><AddOutline /></template>
          新建白板
        </NButton>
      </div>

      <NScrollbar class="sidebar-scroll">
        <div class="whiteboard-list">
          <div
            v-for="wb in whiteboardList"
            :key="wb.id"
            class="whiteboard-item"
            :class="{ active: wb.id === store.activeWhiteboardId && !editingWbId }"
            @click="handleSwitch(wb.id)"
            @dblclick.stop="handleDblClick(wb.id, wb.name)"
          >
            <!-- 重命名模式 -->
            <NInput
              v-if="editingWbId === wb.id"
              v-model:value="renameText"
              class="wb-rename-input"
              size="tiny"
              @blur="finishRename"
              @keydown.enter.prevent="finishRename"
              @keydown.escape.prevent="cancelRename"
            />
            <!-- 正常显示 -->
            <NText v-else class="wb-name">{{ wb.name }}</NText>

            <NPopconfirm
              v-if="whiteboardList.length > 1"
              @positive-click="handleRemove(wb.id)"
            >
              <template #trigger>
                <NButton size="tiny" quaternary type="error" class="wb-remove-btn">
                  <template #icon><TrashOutline /></template>
                </NButton>
              </template>
              确定删除此白板？
            </NPopconfirm>
          </div>
        </div>
      </NScrollbar>
    </template>
  </div>
</template>

<style scoped>
.sidebar-left {
  width: 220px;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  flex-shrink: 0;
  transition: width 0.2s;
  overflow: hidden;
}

.sidebar-left.collapsed {
  width: 36px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 12px;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
}

.sidebar-toolbar {
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-scroll {
  flex: 1;
}

.whiteboard-list {
  padding: 4px;
}

.whiteboard-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  gap: 4px;
}

.whiteboard-item:hover {
  background: var(--color-bg);
}

.whiteboard-item.active {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.wb-name {
  font-size: 13px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-rename-input {
  flex: 1;
  min-width: 0;
}

.wb-remove-btn {
  opacity: 0;
  transition: opacity 0.15s;
}

.whiteboard-item:hover .wb-remove-btn {
  opacity: 1;
}
</style>
