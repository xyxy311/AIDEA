<script setup lang="ts">
/**
 * NodeTreePanel - 节点树面板（左侧活动栏面板之一）
 *
 * 展示节点树结构（基于 nodeStore 的 parentId 构建），支持：
 * - 展开/收起子树
 * - 单击切换活跃视图（查看该节点的子级）
 * - 双击重命名节点（根节点文本即项目名，显示在顶部工具栏，可双击编辑）
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

/** 根节点名称（即项目名，单一数据源） */
const rootName = computed(() => nodeStore.getNode(rootViewId.value)?.text ?? '')

/**
 * 渲染到列表的节点树：过滤掉根节点（根节点名称已放顶部工具栏），
 * 并把子级深度左移 1，使首层子级从 0 对齐（缩进竖线同步随深度变化，不会错位）。
 */
const treeItems = computed(() =>
  flatTree.value
    .filter((item) => !item.isRoot)
    .map((item) => ({ ...item, depth: item.depth - 1 })),
)

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

// ── 根节点名称：单击即时切换根视图 / 双击编辑项目名 ──
//
// 单击立即切换（与点击其它节点/标签一致、无延迟）。
// 注意：双击会先触发两次 click，故双击编辑前会先切到根视图（闪切一次）。
// 受限于「单击即时响应」与「双击编辑」无法在不延时下两全，此处选择即时切换。

/**
 * 单击根节点名称 → 立即切换到项目根节点视图。
 */
function handleRootClick(): void {
  project.switchView(rootViewId.value)
}

/**
 * 双击根节点名称 → 编辑项目名。
 */
function handleRootDblClick(): void {
  handleDblClick(rootViewId.value, rootName.value)
}
</script>

<template>
  <div class="node-tree-panel">
    <!-- 顶部操作工具栏：左侧显示根节点名称（双击可编辑项目名），右侧为操作按钮 -->
    <div class="panel-toolbar">
      <div class="toolbar-title">
        <!-- 根节点重命名（复用列表节点重命名逻辑） -->
        <NInput
          v-if="editingNodeId === rootViewId"
          v-model:value="renameText"
          class="node-rename-input"
          size="tiny"
          @blur="finishRename"
          @keydown.enter.prevent="finishRename"
          @keydown.escape.prevent="cancelRename"
        />
        <span
          v-else
          class="toolbar-title-name"
          :title="rootName"
          :class="{ 'root-view-active': project.currentNodeId === rootViewId }"
          @click="handleRootClick"
          @dblclick.stop="handleRootDblClick"
        >{{ rootName }}</span>
      </div>
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
          v-for="item in treeItems"
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

/* 顶部操作工具栏 */
.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border);
}

/* 左侧：根节点名称（双击可编辑项目名） */
.toolbar-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.toolbar-title-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer; /* 单击切换根视图（双击仍可编辑项目名） */
  border-radius: 4px;
  padding: 2px 6px;
  margin-left: -6px;
  transition: background 0.15s, color 0.15s;
}

.toolbar-title-name:hover {
  background: var(--color-hover);
  color: var(--color-primary-hover);
}

/* 当前正查看根节点视图时高亮项目名 */
.toolbar-title-name.root-view-active {
  color: var(--color-primary-hover);
}

/* 根节点重命名输入框沿用列表节点输入框样式 */
.toolbar-title .node-rename-input {
  flex: 1;
  min-width: 0;
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