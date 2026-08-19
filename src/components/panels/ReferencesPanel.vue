<script setup lang="ts">
/**
 * ReferencesPanel - 引用面板（左侧活动栏面板之一）
 *
 * 只展示所有可引用节点（text 以 `#` 开头、定义过引用名的节点）：
 * - 显示用 `#名`（# = 引用定义符号）
 * - 单击 → 进入该节点子视图（查看其子级）
 * - 双击 → 行内重命名（编辑首行，保留 `#` 定义符号与正文，含重名校验）
 * - 每行删除按钮 + 确认 → 递归删除该节点及其子树
 *
 * 语义澄清：#A 表示节点 A 可被引用；@A 表示在另一节点中引用 A。
 * 数据源：nodeStore.referenceableNodes()（派生索引，按引用名字典序排序）。
 */
import { ref, computed, nextTick } from 'vue'
import { NButton, NInput, NScrollbar, NPopconfirm, NEmpty } from 'naive-ui'
import { useMessage } from 'naive-ui'
import { TrashOutline } from '@vicons/ionicons5'
import { useProjectStore } from '@/stores/project'
import { useNodeStore } from '@/stores/node'
import { useNodeTree } from '@/composables/useNodeTree'
import { t } from '@/composables/useT'
import NodeItem from '@/components/common/NodeItem.vue'

const project = useProjectStore()
const nodeStore = useNodeStore()
const { deleteNodeRecursive, renameNode, rootViewId } = useNodeTree()
const message = useMessage()

/** 所有可引用节点（引用名 -> 节点），按引用名排序 */
const refs = computed(() => nodeStore.referenceableNodes())

// ── 行内重命名状态 ──
const editingNodeId = ref<string | null>(null)
const renameText = ref('')
/** 非首行正文（编辑第一行时暂存，保存时拼回，避免数据丢失） */
const pendingBody = ref('')

function handleSwitch(nodeId: string): void {
  if (editingNodeId.value) return // 重命名中不切换
  project.switchView(nodeId)
}

function handleRemove(nodeId: string): void {
  deleteNodeRecursive(nodeId)
}

function handleDblClick(nodeId: string): void {
  const text = nodeStore.getNode(nodeId)?.text ?? ''
  const lines = text.split('\n')
  // 编辑首行（含引用定义符号 #），其余行作为正文暂存、保存时拼回
  pendingBody.value = lines.slice(1).join('\n')
  editingNodeId.value = nodeId
  renameText.value = lines[0]
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.ref-rename-input input')
    input?.focus()
    input?.select()
  })
}

/** 保存重命名（改节点 text，含引用重名校验；保留 # 定义符号与正文） */
function finishRename(): void {
  if (editingNodeId.value && renameText.value.trim()) {
    const body = pendingBody.value ? '\n' + pendingBody.value : ''
    const result = renameNode(editingNodeId.value, renameText.value + body)
    if (!result.ok && result.conflictRef) {
      message.warning(t('nodeEditor.referenceNameConflict', { name: result.conflictRef }))
      return // 保持编辑态
    }
  }
  editingNodeId.value = null
  pendingBody.value = ''
}

function cancelRename(): void {
  editingNodeId.value = null
}

/**
 * 引用名首行中 `#名` 之后的剩余部分。
 * 语义：text 以 `#` 开头，`#` 后首行 trim 即为 name（extractReferenceName 语义），
 * 因此 `#名` 在首行开头；slice(1 + name.length) 即得剩余。空串表示无剩余、不渲染。
 */
function refNameSuffix(nodeId: string, name: string): string {
  const firstLine = (nodeStore.getNode(nodeId)?.text ?? '').split('\n')[0].trim()
  return firstLine.slice(1 + name.length)
}
</script>

<template>
  <div class="refs-panel">
    <NScrollbar class="refs-scroll">
      <div v-if="refs.length === 0" class="refs-empty">
        <NEmpty :description="t('leftSidebar.refsEmpty')" size="small" />
      </div>

      <div v-else class="refs-list">
        <div
          v-for="ref in refs"
          :key="ref.nodeId"
          class="ref-item"
          :class="{ active: ref.nodeId === project.currentNodeId && !editingNodeId }"
          @click="handleSwitch(ref.nodeId)"
          @dblclick.stop="handleDblClick(ref.nodeId)"
        >
          <!-- 编辑态：仍用 NInput 替换整行内容 -->
          <NInput
            v-if="editingNodeId === ref.nodeId"
            v-model:value="renameText"
            class="ref-rename-input"
            size="tiny"
            placeholder="#"
            @blur="finishRename"
            @keydown.enter.prevent="finishRename"
            @keydown.escape.prevent="cancelRename"
          />
          <!-- 展示态：NodeItem 渲染标题 + 标签 + 路径（行内省略、含悬停提示） -->
          <NodeItem v-else :node="nodeStore.getNode(ref.nodeId)!">
            <template #title>
              <!-- 引用名 `#名` 主色高亮（同画布语义） -->
              <span class="ref-name-hi">#{{ ref.name }}</span>
              <!-- `#名` 之后的正文剩余部分（无则省略） -->
              <span v-if="refNameSuffix(ref.nodeId, ref.name)">{{ refNameSuffix(ref.nodeId, ref.name) }}</span>
            </template>
          </NodeItem>

          <!-- 删除按钮（hover 显示） -->
          <NPopconfirm
            v-if="ref.nodeId !== rootViewId"
            @positive-click="handleRemove(ref.nodeId)"
          >
            <template #trigger>
              <NButton size="tiny" quaternary type="error" class="ref-remove-btn">
                <template #icon><TrashOutline /></template>
              </NButton>
            </template>
            {{ t('leftSidebar.deleteConfirmReference', { name: ref.name }) }}
          </NPopconfirm>
        </div>
      </div>
    </NScrollbar>
  </div>
</template>

<style scoped>
.refs-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.refs-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.refs-scroll {
  flex: 1;
}

.refs-empty {
  padding: 24px 0;
}

.refs-list {
  padding: 4px;
}

.ref-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.ref-item:hover {
  background: var(--color-hover);
}

.ref-item.active {
  background: var(--color-active-bg);
  border: 1px solid var(--color-active-border);
}

/* 引用名 `#名` 高亮：主色（与画布引用语义一致） */
.ref-name-hi {
  color: var(--color-primary);
}

.ref-rename-input {
  flex: 1;
  min-width: 0;
}

.ref-remove-btn {
  opacity: 0;
  transition: opacity 0.15s;
}

.ref-item:hover .ref-remove-btn {
  opacity: 1;
}
</style>