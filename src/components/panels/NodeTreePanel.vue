<script setup lang="ts">
/**
 * NodeTreePanel - 节点树面板（左侧活动栏面板之一）
 *
 * 展示节点树结构（基于 nodeStore 的 parentId 构建），支持：
 * - 展开/收起子树
 * - 单击切换活跃视图（查看该节点的子级）
 * - 双击重命名节点（根节点重命名即改项目名）
 * - 纯图标按钮：在当前活跃视图下新建子节点 / 递归删除当前节点
 * - 逐节点删除（hover 显示）
 *
 * 叶子节点（无子节点且非根）颜色减淡，提示其不可展开。
 */
import { ref, nextTick, computed, watch } from 'vue'
import {
  NButton,
  NInput,
  NScrollbar,
  NPopconfirm,
} from 'naive-ui'
import { useMessage } from 'naive-ui'
import {
  AddOutline,
  TrashOutline,
  ChevronForward,
  ChevronDown,
} from '@vicons/ionicons5'
import { useProjectStore } from '@/stores/project'
import { useNodeTree } from '@/composables/useNodeTree'
import { useActiveView } from '@/composables/useActiveView'
import { t } from '@/composables/useT'
import { useNodeStore } from '@/stores/node'

const project = useProjectStore()
const {
  flatTree,
  rootViewId,
  toggleExpand,
  addSubNode,
  deleteNodeRecursive,
  renameNode,
} = useNodeTree()

const active = useActiveView()
const nodeStore = useNodeStore()
const message = useMessage()

/** 画布中选中的节点 ID 集合（来自当前活跃视图） */
const selectedSet = computed(() => active.view.selectedNodeIds)

/**
 * 画布选中变化时，自动展开选中节点的所有祖先，
 * 使选中节点在节点树中立即可见。
 */
watch(selectedSet, (ids) => {
  for (const id of ids) {
    if (!nodeStore.nodes.has(id)) continue
    for (const ancestorId of nodeStore.pathToRoot(id)) {
      project.expand(ancestorId)
    }
  }
})

// ── 重命名状态 ──
const editingNodeId = ref<string | null>(null)
const renameText = ref('')

// ── 工具栏操作（纯图标按钮）──

/** 在活跃视图下新建子节点并进入编辑态 */
function handleAdd(): void {
  addSubNode(project.currentNodeId)
}

/** 递归删除当前活跃节点（含子树） */
function handleDeleteActive(): void {
  deleteNodeRecursive(project.currentNodeId)
}

// ── 节点项操作 ──

function handleSwitch(id: string): void {
  if (editingNodeId.value) return // 重命名中不切换
  project.switchView(id)
}

function handleRemove(id: string): void {
  deleteNodeRecursive(id)
}

// ── 双击开始重命名 ──

function handleDblClick(nodeId: string, currentName: string): void {
  editingNodeId.value = nodeId
  renameText.value = currentName
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.node-rename-input input')
    input?.focus()
    input?.select()
  })
}

/**
 * 保存重命名。
 * 更新节点文本（单一数据源）；根节点文本即项目名。
 */
function finishRename(): void {
  if (editingNodeId.value && renameText.value.trim()) {
    const result = renameNode(editingNodeId.value, renameText.value)
    if (!result.ok && result.conflictRef) {
      message.warning(t('nodeEditor.referenceNameConflict', { name: result.conflictRef }))
      // 保持编辑态，不关闭
      return
    }
  }
  editingNodeId.value = null
}

/** 取消重命名（Escape 键） */
function cancelRename(): void {
  editingNodeId.value = null
}
</script>

<template>
  <div class="node-tree-panel">
    <!-- 面板标题栏 -->
    <div class="panel-header">
      <span class="panel-title">{{ t('leftSidebar.nodeTree') }}</span>
      <div class="panel-actions">
        <!-- 纯图标按钮：新建子节点 -->
        <NButton
          size="tiny"
          quaternary
          class="action-btn"
          :title="t('leftSidebar.newChild')"
          @click="handleAdd"
        >
          <template #icon><AddOutline /></template>
        </NButton>
        <!-- 纯图标按钮：删除当前节点 -->
        <NPopconfirm @positive-click="handleDeleteActive">
          <template #trigger>
            <NButton
              size="tiny"
              quaternary
              type="error"
              class="action-btn"
              :title="t('leftSidebar.deleteCurrent')"
              :disabled="project.currentNodeId === rootViewId"
            >
              <template #icon><TrashOutline /></template>
            </NButton>
          </template>
          {{ t('leftSidebar.deleteConfirmCurrent') }}
        </NPopconfirm>
      </div>
    </div>

    <NScrollbar class="panel-scroll" x-scrollable>
      <div class="node-list">
        <div
          v-for="item in flatTree"
          :key="item.id"
          class="node-item"
          :class="{
            active: item.id === project.currentNodeId && !editingNodeId,
            selected: selectedSet.has(item.id),
            leaf: !item.hasChildren && !item.isRoot,
          }"
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
            v-if="editingNodeId === item.id"
            v-model:value="renameText"
            class="node-rename-input"
            size="tiny"
            @blur="finishRename"
            @keydown.enter.prevent="finishRename"
            @keydown.escape.prevent="cancelRename"
          />
          <!-- 正常显示（原生 span：避免 NText 在 flex 布局下 min-width:0 导致文字被裁剪） -->
          <span v-else class="node-name">{{ item.name }}</span>

          <!-- 删除按钮（根节点不显示） -->
          <NPopconfirm
            v-if="!item.isRoot"
            @positive-click="handleRemove(item.id)"
          >
            <template #trigger>
              <NButton size="tiny" quaternary type="error" class="node-remove-btn">
                <template #icon><TrashOutline /></template>
              </NButton>
            </template>
            {{ t('leftSidebar.deleteConfirmNode') }}
          </NPopconfirm>
        </div>
      </div>
    </NScrollbar>
  </div>
</template>

<style scoped>
.node-tree-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* 标题栏 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border);
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
}

.panel-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.action-btn {
  flex-shrink: 0;
}

.panel-scroll {
  flex: 1;
}

/* 横向滚动：列表内容宽度不被容器压缩，溢出时显示横向滚动条 */
.node-list {
  padding: 4px;
  min-width: max-content;
  white-space: nowrap;
}

.node-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  gap: 4px;
  position: relative; /* 使绝对定位的缩进竖线以此为锚点 */
}

.node-item:hover {
  background: var(--color-hover);
}

.node-item.active {
  background: var(--color-active-bg);
  border: 1px solid var(--color-active-border);
}

/* 画布选中节点：无填充圆角矩形框（与画布 Transformer 选中色一致） */
.node-item.selected {
  box-shadow: inset 0 0 0 2px var(--color-selected-ring);
}

/* 叶子节点（无子节点且非根）颜色减淡 */
.node-item.leaf {
  opacity: 0.55;
}

.node-item.leaf:hover {
  opacity: 0.85;
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
  background: var(--color-hover);
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

/* ── 节点名称 ── */

.node-name {
  font-size: 13px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}

.node-rename-input {
  flex: 1;
  min-width: 0;
}

/* ── 删除按钮（hover 显示） ── */

.node-remove-btn {
  opacity: 0;
  transition: opacity 0.15s;
}

.node-item:hover .node-remove-btn {
  opacity: 1;
}

/* ── 缩进竖线（VSCode 风格）──
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
  border-left: 1px solid var(--color-indent-line);
}

/* 首条竖线偏移 12px（与 base padding 对齐） */
.indent-line-first {
  margin-left: 12px;
}

/* active/hover 态下竖线保持可见且协调 */
.node-item.active .indent-line,
.node-item:hover .indent-line {
  border-left-color: var(--color-indent-line-strong);
}
</style>