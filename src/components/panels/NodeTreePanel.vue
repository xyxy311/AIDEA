<script setup lang="ts">
/**
 * NodeTreePanel - 节点树面板：基于 parentId 展示节点树，支持展开/收起、单击切换视图、
 * 双击重命名（根节点文本即项目名）、新建/递归删除、右键菜单、拖拽移动节点（跨视图 reparent）、
 * 「显示全部」勾选（控制叶子节点显隐，状态持久化）、叶子节点颜色减淡。
 */
import { ref, nextTick, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useStorage } from '@vueuse/core'
import { NButton, NCheckbox, NInput, NScrollbar, NDropdown, useDialog } from 'naive-ui'
import type { DropdownOption } from 'naive-ui'
import { useMessage } from 'naive-ui'
import {
  AddOutline,
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
  renameNode,
  canPaste,
  copyNodeTree,
  cutNodeTree,
  pasteIntoNode,
  deleteNodeRecursive,
  moveNodeUnder,
  collectDescendants,
} = useNodeTree()

const active = useActiveView()
const nodeStore = useNodeStore()
const message = useMessage()
const dialog = useDialog()

/** 根节点名称（即项目名，单一数据源） */
const rootName = computed(() => nodeStore.getNode(rootViewId.value)?.text ?? '')

/** 「显示全部」勾选态：勾选显示叶子节点（全部节点），不勾选只显示有子节点的节点；持久化到应用配置 */
const showAll = useStorage('aidea-node-tree-show-all', false)

/** 列表节点树：过滤根节点（名称在顶部工具栏）并将子级深度左移 1，使首层子级对齐；
 * 不勾选「显示全部」时隐藏叶子节点（只显示有子节点的节点） */
const treeItems = computed(() =>
  flatTree.value
    .filter((item) => !item.isRoot && (showAll.value || item.hasChildren))
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

// ── 右键菜单状态 ──
const ctxMenu = ref<{ x: number; y: number; nodeId: string } | null>(null)

// ── 拖拽移动状态 ──
const dragNodeId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)

/**
 * 拖拽期间在 window 上统一处理 dragover/drop，并用 elementFromPoint 命中落点。
 * 仅当指针落在有效目标（节点项或根节点名称）上才 preventDefault（武装放置区、move 光标）；
 * 空白/非法区域不 preventDefault —— 浏览器保持 no-drop，放置被禁用。
 */
const onWindowDragOver = (e: DragEvent): void => {
  if (!dragNodeId.value) return
  const targetId = targetIdAt(e.clientX, e.clientY)
  if (targetId) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }
  dropTargetId.value = targetId
}

const onWindowDrop = (e: DragEvent): void => {
  const nodeId = dragNodeId.value
  const targetId = nodeId ? targetIdAt(e.clientX, e.clientY) : null
  stopDrag()
  if (nodeId && targetId) {
    e.preventDefault()
    moveNodeUnder(nodeId, targetId)
  }
}

onMounted(() => {
  window.addEventListener('dragover', onWindowDragOver)
  window.addEventListener('drop', onWindowDrop)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragover', onWindowDragOver)
  window.removeEventListener('drop', onWindowDrop)
})

// ── 工具栏操作（纯图标按钮）──

/** 在项目根节点下新建子节点（根节点工具栏的添加按钮） */
function handleAdd(): void {
  addSubNode(rootViewId.value)
}

// ── 节点项操作 ──

function handleSwitch(id: string): void {
  if (editingNodeId.value) return // 重命名中不切换
  project.switchView(id)
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

// ── 右键菜单 ──

/** 菜单项：依目标节点与剪贴板状态推导（根节点禁剪切/删除；无剪贴板内容禁粘贴） */
const menuOptions = computed<DropdownOption[]>(() => {
  const node = ctxMenu.value
  if (!node) return []
  const isRoot = node.nodeId === rootViewId.value
  return [
    { key: 'add', label: t('leftSidebar.addChildInMenu') },
    { key: 'rename', label: t('leftSidebar.renameInMenu') },
    { key: 'copy', label: t('leftSidebar.copyInMenu') },
    { key: 'cut', label: t('leftSidebar.cutInMenu'), disabled: isRoot },
    { key: 'paste', label: t('leftSidebar.pasteInMenu'), disabled: !canPaste.value },
    { key: 'delete', label: t('leftSidebar.deleteInMenu'), disabled: isRoot },
  ]
})

/** 打开节点右键菜单（放弃当前重命名输入态，避免状态互斥） */
function openContextMenu(nodeId: string, e: MouseEvent): void {
  editingNodeId.value = null
  ctxMenu.value = { x: e.clientX, y: e.clientY, nodeId }
}

/** 关闭右键菜单 */
function closeContextMenu(): void {
  ctxMenu.value = null
}

/** 菜单项选择分发 */
function handleMenuSelect(key: string | number): void {
  const nodeId = ctxMenu.value?.nodeId
  closeContextMenu()
  if (!nodeId) return
  if (key === 'add') {
    addSubNode(nodeId)
  } else if (key === 'rename') {
    handleDblClick(nodeId, nodeStore.getNode(nodeId)?.text ?? '')
  } else if (key === 'copy') {
    copyNodeTree(nodeId)
  } else if (key === 'cut') {
    cutNodeTree(nodeId)
  } else if (key === 'paste') {
    pasteIntoNode(nodeId)
  } else if (key === 'delete') {
    confirmDelete(nodeId)
  }
}

/** 删除确认弹窗：确认后递归删除整棵子树（可撤销） */
function confirmDelete(nodeId: string): void {
  if (nodeId === rootViewId.value) return
  dialog.warning({
    title: t('leftSidebar.deleteCurrent'),
    content: t('leftSidebar.deleteConfirmNode'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => deleteNodeRecursive(nodeId),
  })
}

// ── 拖拽移动节点（reparent 到其它节点或根的子级）──

/** 目标是否可接收拖放：非自身、非其自身子树节点（防环） */
function isDropTargetAllowed(targetId: string): boolean {
  if (!dragNodeId.value || targetId === dragNodeId.value) return false
  return !collectDescendants(dragNodeId.value).includes(targetId)
}

/**
 * 解算指针(x,y)处落点：命中节点项→该节点；落于空白/根区域→根节点。
 * 非法目标（自身/后代）返回 null。
 */
/**
 * 解算指针(x,y)处落点。仅两类有效目标：
 *  - 命中节点项 → 该节点；
 *  - 命中根节点名称 → 根节点（顶级）。
 * 其余（含列表下方空白）返回 null，即该处不可放置。
 */
function targetIdAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  const itemEl = el?.closest?.('.node-item') as HTMLElement | null
  if (itemEl?.dataset.nodeId) {
    const id = itemEl.dataset.nodeId
    return isDropTargetAllowed(id) ? id : null
  }
  if (el?.closest?.('.toolbar-title-name')) {
    return rootViewId.value
  }
  return null
}

/** 开始拖拽：记录源节点并设置拖拽类型 */
function onDragStart(nodeId: string, e: DragEvent): void {
  if (editingNodeId.value) {
    e.preventDefault()
    return
  }
  closeContextMenu()
  dragNodeId.value = nodeId
  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData('text/plain', nodeId)
}

/** 结束拖拽：清理拖动/高亮状态 */
function stopDrag(): void {
  dragNodeId.value = null
  dropTargetId.value = null
}

// ── 根节点名称：单击即时切换根视图 / 双击编辑项目名 ──
// 双击会先触发两次 click 切到根视图（闪切一次）；「即时响应」与「双击编辑」难两全，此处选即时切换。

/** 单击根节点名称 → 立即切换到项目根节点视图 */
function handleRootClick(): void {
  project.switchView(rootViewId.value)
}

/** 双击根节点名称 → 编辑项目名 */
function handleRootDblClick(): void {
  handleDblClick(rootViewId.value, rootName.value)
}
</script>

<template>
  <div class="node-tree-panel">
    <!-- 顶部操作工具栏：根节点名称（双击可编辑项目名）+ 紧挨其右端的操作按钮 -->
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
          :class="{
            'root-view-active': project.currentNodeId === rootViewId,
            'drop-target': dropTargetId === rootViewId,
          }"
          @click="handleRootClick"
          @dblclick.stop="handleRootDblClick"
        >{{ rootName }}</span>

        <!-- 与根节点名称紧挨的按钮：显示全部勾选框 + 新建子节点 -->
        <div class="panel-actions">
          <NCheckbox
            size="small"
            class="show-all-check"
            v-model:checked="showAll"
            :title="t('leftSidebar.showAllNodes')"
          >
            <span class="show-all-label">{{ t('leftSidebar.showAllNodes') }}</span>
          </NCheckbox>
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
        </div>
      </div>
    </div>

    <NScrollbar class="panel-scroll" x-scrollable>
      <div class="node-list">
        <div
          v-for="item in treeItems"
          :key="item.id"
          class="node-item"
          :data-node-id="item.id"
          :draggable="editingNodeId !== item.id"
          :class="{
            active: item.id === project.currentNodeId && !editingNodeId,
            selected: selectedSet.has(item.id),
            leaf: !item.hasChildren && !item.isRoot,
            dragging: item.id === dragNodeId,
            'drop-target': item.id === dropTargetId,
          }"
          :style="{ paddingLeft: 12 + item.depth * 16 + 'px' }"
          @click="handleSwitch(item.id)"
          @dblclick.stop="handleDblClick(item.id, item.name)"
          @contextmenu.prevent.stop="openContextMenu(item.id, $event)"
          @dragstart="onDragStart(item.id, $event)"
          @dragend="stopDrag"
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
        </div>
      </div>
    </NScrollbar>

    <!-- 右键上下文菜单（光标定位，点击外部/Escape 自动关闭） -->
    <NDropdown
      v-if="ctxMenu"
      trigger="manual"
      :show="true"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :options="menuOptions"
      @update:show="closeContextMenu"
      @clickoutside="closeContextMenu"
      @select="handleMenuSelect"
    />
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
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border);
}

/* 根节点名称 + 紧挨其右端的操作按钮（同一行） */
.toolbar-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}

.toolbar-title-name {
  flex: 0 1 auto;
  min-width: 0;
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
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.show-all-check {
  margin-right: 4px;
  flex-shrink: 0;
}

.show-all-label {
  font-size: 12px;
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

/* 拖拽源：减淡提示 */
.node-item.dragging {
  opacity: 0.4;
}

/* 拖放目标（有效落点）：主色虚线轮廓 */
.node-item.drop-target {
  outline: 2px dashed var(--color-primary);
  outline-offset: -1px;
  background: var(--color-primary-faint);
}

/* 根节点作为拖放目标：内缩虚线高亮 */
.toolbar-title-name.drop-target {
  box-shadow: inset 0 0 0 2px var(--color-primary);
  outline: 1px dashed var(--color-primary);
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