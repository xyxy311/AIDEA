<script setup lang="ts">
/**
 * TabBar - 多标签页栏（并入顶部图标条中段，由 AppShell 居中、定宽放置）
 *
 * 功能：
 * - 渲染 project.tabs 每个标签，标题 = 观察节点 text 首行（trim，`#` 参考名规则一致；根节点即项目名）
 * - 活动标签高亮（主色底部指示条 + 淡背景，与 IconBar 活动态一致）；点击 switchToTab
 * - 每标签 hover 显示关闭 ×（tabs<=1 时隐藏），点击 closeTab
 * - 最右侧 "+" 主色按钮 addTab，固定覆盖在标签带右端之上（不随滚轮滚动，标签过多时遮住滑过的标签）
 * - 标签带经 `common/WheelScroll` 提供滚轮横向滚动，隐藏滚动条（与左/右两区滚动方式一致）
 * - HTML5 拖拽排序 → moveTab（复用活动栏拖拽抑制误触 click 模式）
 * - 双击标签标题行内改名（useNodeTree.renameNode，保留 2..n 行 body，只改标题行）
 * - 监听 tabFallbackNotice，true 时 toast 提示并复位为 false
 */
import { ref, watch, nextTick } from 'vue'
import { NTooltip, useMessage } from 'naive-ui'
import { AddOutline, CloseOutline } from '@vicons/ionicons5'
import WheelScroll from '@/components/common/WheelScroll.vue'
import { useProjectStore } from '@/stores/project'
import { useNodeStore } from '@/stores/node'
import { useNodeTree } from '@/composables/useNodeTree'
import { t } from '@/composables/useT'

interface TabItem {
  id: string
  viewedNodeId: string
}

const project = useProjectStore()
const nodeStore = useNodeStore()
const message = useMessage()
const { renameNode } = useNodeTree()

/** 节点标题：text 首行 trim；以 `#` 开头则按参考名规则去掉 `#`；根节点即项目名（单行） */
function nodeTitle(text: string): string {
  let first = text.split('\n')[0]
  if (first.startsWith('#')) first = first.slice(1)
  return first.trim()
}

/** 标签标题（随节点 text 响应式） */
function tabTitle(tab: TabItem): string {
  const node = nodeStore.getNode(tab.viewedNodeId)
  if (!node) return t('viewTab.placeholder')
  const title = nodeTitle(node.text)
  return title || t('viewTab.placeholder')
}

// ── HTML5 拖拽排序（抑制误触 click）──

const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)
const suppressClick = ref(false)

function onDragStart(index: number, e: DragEvent): void {
  dragIndex.value = index
  suppressClick.value = true
  e.dataTransfer?.setData('text/plain', String(index))
}

function onDragOver(index: number, e: DragEvent): void {
  e.preventDefault()
  if (dragIndex.value !== null && dragIndex.value !== index) {
    dropIndex.value = index
  }
}

function onDrop(index: number, e: DragEvent): void {
  e.preventDefault()
  if (dragIndex.value !== null) {
    project.moveTab(dragIndex.value, index)
  }
  endDrag()
}

function onDragEnd(): void {
  endDrag()
}

function endDrag(): void {
  dragIndex.value = null
  dropIndex.value = null
  // 本 tick 后放开 click 抑制（拖拽结束若顺带触发 click 会被忽略）
  setTimeout(() => {
    suppressClick.value = false
  }, 0)
}

/** 点击标签切换（拖拽刚结束时忽略该次 click） */
function onTabClick(tab: TabItem): void {
  if (suppressClick.value) {
    suppressClick.value = false
    return
  }
  project.switchToTab(tab.id)
}

// ── 行内改名（保留 body，只改标题行）──

const editingId = ref<string | null>(null)
const editValue = ref('')
// 位于 v-for(tabs) 内，Vue 3 会把字符串 ref 收集为数组；同一时刻仅编辑一个标签，取首项
  const editInput = ref<HTMLInputElement[]>([])

function startRename(tab: TabItem): void {
  const node = nodeStore.getNode(tab.viewedNodeId)
  if (!node) return
  editingId.value = tab.id
  editValue.value = nodeTitle(node.text)
}

/** 保存改名：2..n 行作 body 拼回，保证只改标题行不丢正文 */
function commitRename(): void {
  if (editingId.value == null) return
  const tabId = editingId.value
  editingId.value = null
  const tab = project.tabs.find((tb) => tb.id === tabId)
  if (!tab) return
  const node = nodeStore.getNode(tab.viewedNodeId)
  if (!node) return
  const body = node.text.split('\n').slice(1).join('\n')
  const newText = body ? `${editValue.value}\n${body}` : editValue.value
  const res = renameNode(tab.viewedNodeId, newText)
  if (!res.ok) {
    warning(res.conflictRef)
  }
}

function cancelRename(): void {
  editingId.value = null
}

function warning(conflictRef?: string): void {
  if (conflictRef) {
    message.warning(t('nodeEditor.referenceNameConflict', { name: conflictRef }))
  } else {
    message.warning(t('viewTab.renameConflict'))
  }
}

/** 进入改名态后聚焦并全选初值 */
watch(editingId, (id) => {
  if (id != null) {
    nextTick(() => {
      const el = editInput.value[0]
      if (el) {
        el.focus()
        el.select()
      }
    })
  }
})

// ── 标签回退提示：观察节点被删除时经 store 置 tabFallbackNotice ──

watch(
  () => project.tabFallbackNotice,
  (notice) => {
    if (notice) {
      message.info(t('viewTab.nodeDeletedToast'))
      project.tabFallbackNotice = false
    }
  },
)
</script>

<template>
  <div class="tab-bar">
    <!-- 滚轮横向滚动区（WheelScroll 隐藏滚动条）：标签 + 新增按钮一起滚动 -->
    <WheelScroll class="tab-scroll">
      <div class="tabs">
        <div
          v-for="(tab, index) in project.tabs"
          :key="tab.id"
          class="tab"
          :class="{
            active: tab.id === project.activeTabId,
            'is-dragging': dragIndex === index,
            'is-drop-target': dropIndex === index && dragIndex !== null && dragIndex !== index,
          }"
          :draggable="true"
          @dragstart.stop="onDragStart(index, $event)"
          @dragenter.prevent="dropIndex = index"
          @dragover.prevent="onDragOver(index, $event)"
          @dragleave="dropIndex === index && (dropIndex = null)"
          @drop.prevent="onDrop(index, $event)"
          @dragend="onDragEnd"
        >
          <!-- 标题区：单击切换、双击改名 -->
          <div class="tab-label" @click="onTabClick(tab)" @dblclick="startRename(tab)">
            <input
              v-if="editingId === tab.id"
              ref="editInput"
              v-model="editValue"
              class="tab-edit"
              @keydown.enter.prevent="commitRename"
              @keydown.esc.prevent="cancelRename"
              @blur="commitRename"
            />
            <span v-else class="tab-title">{{ tabTitle(tab) }}</span>
          </div>

          <!-- 关闭按钮：hover 显示；仅剩一个标签时隐藏 -->
          <button
            v-if="project.tabs.length > 1"
            type="button"
            class="tab-close"
            :title="t('viewTab.close')"
            @click.stop="project.closeTab(tab.id)"
          >
            <CloseOutline class="tab-close-icon" />
          </button>
        </div>
      </div>

      <!-- 新增标签按钮：位于所有标签右侧，随标签带一起滚动（简洁"+"，无背景色） -->
      <NTooltip placement="bottom">
        <template #trigger>
          <button type="button" class="tab-add" @click="project.addTab()">
            <AddOutline class="tab-add-icon" />
          </button>
        </template>
        {{ t('viewTab.add') }}
      </NTooltip>
    </WheelScroll>
  </div>
</template>

<style scoped>
/* 并入顶部图标条中段：由 AppShell 的 `.top-center` 定宽居中，本体占满该宽度 */
.tab-bar {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 0;
  user-select: none;
}

/* 滚轮滚动区（WheelScroll 隐藏滚动条），占满中段，仅标签带在其中横向滚动 */
.tab-bar :deep(.wheel-scroll) {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  min-width: 0;
}

/* ── 单个标签 ── */
.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: 180px;
  min-width: 0;
  padding: 0 6px 0 10px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, opacity 0.15s;
}

/* 活动标签：主色淡背景 + 底部主色指示条（与 IconBar 激活态同体系） */
.tab.active {
  background: var(--color-primary-soft);
}

.tab.active::after {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: -6px;
  height: 3px;
  border-radius: 2px;
  background: var(--color-primary);
}

.tab:hover {
  background: var(--color-hover);
}

.tab:hover.active {
  background: var(--color-primary-soft);
}

/* 拖拽中的源标签：淡化 */
.tab.is-dragging {
  opacity: 0.4;
}

/* 拖拽悬停目标：左侧放置指示条 */
.tab.is-drop-target::before {
  content: '';
  position: absolute;
  left: -4px;
  top: 5px;
  bottom: 5px;
  width: 3px;
  border-radius: 2px;
  background: var(--color-primary);
}

.tab-label {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}

.tab-title {
  font-size: 13px;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab.active .tab-title {
  color: var(--color-text);
}

/* ── 行内改名输入框 ── */
.tab-edit {
  width: 100%;
  min-width: 60px;
  padding: 1px 4px;
  font-size: 13px;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-primary);
  border-radius: 4px;
  outline: none;
  user-select: text;
}

/* ── 关闭按钮：hover 显示 ── */
.tab-close {
  display: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, color 0.15s;
}

.tab:hover .tab-close {
  display: flex;
}

.tab.active:hover .tab-close {
  display: flex;
}

.tab-close:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.tab-close-icon {
  width: 13px;
  height: 13px;
}

/* ── 新增标签按钮：位于所有标签右侧，随标签带一起滚动 ──
 * 简洁"+"展示，无背景色；hover 时仅显示淡背景提示可点击。
 */
.tab-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tab-add:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.tab-add:active {
  background: var(--color-hover);
}

.tab-add-icon {
  width: 16px;
  height: 16px;
}
</style>