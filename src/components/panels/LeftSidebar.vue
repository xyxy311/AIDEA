<script setup lang="ts">
/**
 * LeftSidebar - 左侧边栏：树形白板列表
 *
 * 展示树形白板结构（类似文件浏览器的文件夹树），支持：
 * - 展开/收起子树
 * - 单击切换活跃白板
 * - 双击重命名白板（同步更新父白板中的关联节点文本）
 * - 在当前活跃白板下新建子白板
 * - 递归删除白板（含所有子白板）
 */
import { ref, nextTick } from 'vue'
import {
  NButton,
  NInput,
  NScrollbar,
  NPopconfirm,
} from 'naive-ui'
import {
  AddOutline,
  TrashOutline,
  ChevronBack,
  ChevronForward,
  ChevronDown,
  DocumentOutline,
} from '@vicons/ionicons5'
import { useProjectStore } from '@/stores/project'
import { useWhiteboardTree } from '@/composables/useWhiteboardTree'

defineProps<{
  collapsed: boolean
  width: number
  resizing: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const project = useProjectStore()
const {
  flatTree,
  rootWhiteboardId,
  toggleExpand,
  addSubWhiteboard,
  deleteWhiteboardRecursive,
  renameWhiteboard,
} = useWhiteboardTree()

// ── 重命名状态 ──
const editingWbId = ref<string | null>(null)
const renameText = ref('')

// ── 工具栏操作 ──

/** 在活跃白板下新建子白板并切换到新白板 */
function handleAdd(): void {
  addSubWhiteboard(project.activeWhiteboardId)
}

/** 递归删除当前活跃白板 */
function handleDeleteActive(): void {
  deleteWhiteboardRecursive(project.activeWhiteboardId)
}

// ── 白板项操作 ──

function handleSwitch(id: string): void {
  if (editingWbId.value) return // 重命名中不切换
  project.switchWhiteboard(id)
}

function handleRemove(id: string): void {
  deleteWhiteboardRecursive(id)
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

/**
 * 保存重命名。
 * 通过 renameWhiteboard 同步更新父白板中的关联节点文本--
 * 节点文本是单一数据源，更新后会自动同步白板名。
 * 根白板无关联节点，直接重命名白板名。
 */
function finishRename(): void {
  if (editingWbId.value && renameText.value.trim()) {
    renameWhiteboard(editingWbId.value, renameText.value)
  }
  editingWbId.value = null
}

/** 取消重命名（Escape 键） */
function cancelRename(): void {
  editingWbId.value = null
}
</script>

<template>
  <div
    class="sidebar-left"
    :class="{ collapsed, resizing }"
    :style="{ width: collapsed ? '36px' : width + 'px' }"
  >
    <div class="sidebar-header">
      <span v-if="!collapsed" class="sidebar-title">白板树</span>
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
          新建子白板
        </NButton>
        <NPopconfirm @positive-click="handleDeleteActive">
          <template #trigger>
            <NButton
              size="small"
              quaternary
              type="error"
              :disabled="project.activeWhiteboardId === rootWhiteboardId"
            >
              <template #icon><TrashOutline /></template>
              删除
            </NButton>
          </template>
          确定删除当前白板及其所有子白板？
        </NPopconfirm>
      </div>

      <NScrollbar class="sidebar-scroll" x-scrollable>
        <div class="whiteboard-list">
          <div
            v-for="item in flatTree"
            :key="item.id"
            class="whiteboard-item"
            :class="{ active: item.id === project.activeWhiteboardId && !editingWbId }"
            :style="{ paddingLeft: 12 + item.depth * 16 + 'px' }"
            @click="handleSwitch(item.id)"
            @dblclick.stop="handleDblClick(item.id, item.name)"
          >
            <!-- ── 缩进竖线（VSCode 风格，depth>0 时渲染）──
                 使用绝对定位覆盖在 padding 区域内，不影响 flex 布局。 -->
            <div
              v-if="item.depth > 0"
              class="indent-guides"
              :style="{ width: 12 + item.depth * 16 + 'px' }"
            >
              <span
                v-for="i in item.depth"
                :key="i"
                class="indent-line"
                :class="{ 'indent-line-first': i === 1 }"
              />
            </div>

            <!-- 展开/收起箭头 -->
            <span
              v-if="item.hasChildren"
              class="expand-arrow"
              @click.stop="toggleExpand(item.id)"
            >
              <ChevronDown v-if="item.expanded" class="arrow-icon" />
              <ChevronForward v-else class="arrow-icon" />
            </span>
            <span v-else class="expand-placeholder" />

            <!-- 重命名模式 -->
            <NInput
              v-if="editingWbId === item.id"
              v-model:value="renameText"
              class="wb-rename-input"
              size="tiny"
              @blur="finishRename"
              @keydown.enter.prevent="finishRename"
              @keydown.escape.prevent="cancelRename"
            />
            <!-- 正常显示（原生 span：避免 NText 在 flex 布局下 min-width:0 导致文字被裁剪） -->
            <span v-else class="wb-name">{{ item.name }}</span>

            <!-- 删除按钮（根白板不显示） -->
            <NPopconfirm
              v-if="!item.isRoot"
              @positive-click="handleRemove(item.id)"
            >
              <template #trigger>
                <NButton size="tiny" quaternary type="error" class="wb-remove-btn">
                  <template #icon><TrashOutline /></template>
                </NButton>
              </template>
              确定删除此白板及其所有子白板？
            </NPopconfirm>
          </div>
        </div>
      </NScrollbar>
    </template>
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

.sidebar-left.collapsed {
  width: 36px !important; /* !important 覆盖 inline style */
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
  display: flex;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-scroll {
  flex: 1;
}

/* 横向滚动：列表内容宽度不被容器压缩，溢出时显示横向滚动条 */
.whiteboard-list {
  padding: 4px;
  min-width: max-content;
  white-space: nowrap;
}

.whiteboard-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  gap: 4px;
  position: relative; /* 使绝对定位的缩进竖线以此为锚点 */
}

.whiteboard-item:hover {
  background: var(--color-bg);
}

.whiteboard-item.active {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

/* ── 展开箭头 ── */

.expand-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: 3px;
  transition: background 0.15s;
}

.expand-arrow:hover {
  background: var(--color-border);
}

.expand-placeholder {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.arrow-icon {
  font-size: 14px;
  color: var(--color-text);
  opacity: 0.6;
}

.whiteboard-item.active .wb-icon {
  opacity: 0.8;
}

/* ── 白板名称 ── */

.wb-name {
  font-size: 13px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}

.wb-rename-input {
  flex: 1;
  min-width: 0;
}

/* ── 删除按钮（hover 显示） ── */

.wb-remove-btn {
  opacity: 0;
  transition: opacity 0.15s;
}

.whiteboard-item:hover .wb-remove-btn {
  opacity: 1;
}

/* ── 缩进竖线（VSCode 风格） ──
 * 绝对定位覆盖在 padding 区域，不占 flex 流空间。
 * 每条竖线 16px 宽，左边框 1px 淡色，贯穿行高。
 */

.indent-guides {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: stretch;
  pointer-events: none;
}

.indent-line {
  display: block;
  width: 16px;
  height: 100%;
  flex-shrink: 0;
  border-left: 1px solid rgba(128, 128, 128, 0.15);
}

/* 首条竖线偏移 12px（与 base padding 对齐） */
.indent-line-first {
  margin-left: 12px;
}

/* active/hover 态下竖线保持可见且协调 */
.whiteboard-item.active .indent-line,
.whiteboard-item:hover .indent-line {
  border-left-color: rgba(128, 128, 128, 0.22);
}
</style>
