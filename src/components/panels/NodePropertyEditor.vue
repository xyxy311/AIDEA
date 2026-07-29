<script setup lang="ts">
/**
 * NodePropertyEditor — 节点属性编辑面板
 *
 * 当选中节点时，可修改节点的文本内容和外观样式。
 */
import { ref, computed } from 'vue'
import type { NodePresetStyle } from '@/types'
import {
  NInput,
  NColorPicker,
  NForm,
  NFormItem,
  NText,
  NDivider,
  NButton,
  NTag,
  NModal,
  NPopconfirm,
} from 'naive-ui'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import { usePresetsStore } from '@/stores/presets'
import { DEFAULT_NODE_STYLE } from '@/constants'

const active = useActiveWhiteboard()
const presetsStore = usePresetsStore()

// 选中的节点信息
const node = computed(() => active.board.nodes.get(active.board.selectedNodeId))
const selectedCount = computed(() => active.board.selectedNodeIds.size)

const currentText = computed({
  get: () => node.value?.text ?? '',
  set: (val: string) => {
    if (!node.value) return
    active.board.updateSelectedNodesText(val)
  },
})

const currentTextColor = computed({
  get: () => node.value?.textColor ?? DEFAULT_NODE_STYLE.textColor,
  set: (val: string | null) => {
    if (!node.value || !val) return
    active.board.updateSelectedNodesStyle({ textColor: val })
  },
})

const currentBgColor = computed({
  get: () => node.value?.backgroundColor ?? DEFAULT_NODE_STYLE.backgroundColor,
  set: (val: string | null) => {
    if (!node.value || !val) return
    active.board.updateSelectedNodesStyle({ backgroundColor: val })
  },
})

const currentBorderColor = computed({
  get: () => node.value?.borderColor ?? DEFAULT_NODE_STYLE.borderColor,
  set: (val: string | null) => {
    if (!node.value || !val) return
    active.board.updateSelectedNodesStyle({ borderColor: val })
  },
})

const colorPickerMode = 'hex' as const

// ── 节点预设管理 ──

/** 点击预设行 → 应用到选中节点 */
function applyPreset(preset: NodePresetStyle): void {
  active.board.updateSelectedNodesStyle(preset)
}

/** 删除预设 */
function handleDelete(preset: NodePresetStyle): void {
  presetsStore.deleteNodePreset(preset.id)
}

// ── 拖拽排序 ──

const draggedIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(index: number, e: DragEvent): void {
  draggedIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(index: number, e: DragEvent): void {
  e.preventDefault()
  if (draggedIndex.value === null || draggedIndex.value === index) return
  dragOverIndex.value = index
}

function onDrop(index: number, e: DragEvent): void {
  e.preventDefault()
  if (draggedIndex.value === null) {
    dragOverIndex.value = null
    return
  }
  const fromIndex = draggedIndex.value
  if (fromIndex === index) {
    dragOverIndex.value = null
    draggedIndex.value = null
    return
  }
  presetsStore.reorderNodePresets(fromIndex, index)
  dragOverIndex.value = null
  draggedIndex.value = null
}

function onDragEnd(): void {
  draggedIndex.value = null
  dragOverIndex.value = null
}

function onDragLeave(index: number, e: DragEvent): void {
  const target = e.target as HTMLElement
  const relatedTarget = e.relatedTarget as HTMLElement | null
  if (!relatedTarget || !target.contains(relatedTarget)) {
    if (dragOverIndex.value === index) {
      dragOverIndex.value = null
    }
  }
}

// ── Modal 表单 ──

const showModal = ref(false)
const modalTitle = ref('')
const editId = ref<string | null>(null)
const formName = ref('')
const formBgColor = ref('#ffffff')
const formBorderColor = ref('#d1d5db')
const formTextColor = ref('#1f2937')

function resetForm(): void {
  formName.value = ''
  formBgColor.value = '#ffffff'
  formBorderColor.value = '#d1d5db'
  formTextColor.value = '#1f2937'
}

function openEdit(preset: NodePresetStyle): void {
  editId.value = preset.id
  formName.value = preset.name
  formBgColor.value = preset.backgroundColor
  formBorderColor.value = preset.borderColor
  formTextColor.value = preset.textColor
  modalTitle.value = '编辑预设'
  showModal.value = true
}

function openCreate(): void {
  editId.value = null
  resetForm()
  modalTitle.value = '新建预设'
  showModal.value = true
}

function openSaveCurrent(): void {
  editId.value = null
  formName.value = ''
  if (node.value) {
    formBgColor.value = node.value.backgroundColor ?? '#ffffff'
    formBorderColor.value = node.value.borderColor ?? '#d1d5db'
    formTextColor.value = node.value.textColor ?? '#1f2937'
  }
  modalTitle.value = '保存为预设'
  showModal.value = true
}

function handleSave(): void {
  if (!formName.value.trim()) return
  if (editId.value) {
    presetsStore.updateNodePreset(editId.value, {
      name: formName.value.trim(),
      backgroundColor: formBgColor.value,
      borderColor: formBorderColor.value,
      textColor: formTextColor.value,
    })
  } else {
    presetsStore.addNodePreset({
      name: formName.value.trim(),
      backgroundColor: formBgColor.value,
      borderColor: formBorderColor.value,
      textColor: formTextColor.value,
    })
  }
  showModal.value = false
}
</script>

<template>
  <div class="property-editor" v-if="node">
    <!-- 多选提示 -->
    <div class="multi-select-hint">
      <NTag size="small" type="info" :bordered="false">
        已选中 {{ selectedCount }} 个节点
      </NTag>
    </div>

    <NForm label-placement="top" size="small">
      <!-- 文本 -->
      <NFormItem label="文本内容">
        <NInput
          v-model:value="currentText"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          placeholder="输入节点文本"
        />
      </NFormItem>

      <NDivider style="margin: 8px 0" />

      <!-- 外观样式 -->
      <NText depth="3" style="font-size: 12px; font-weight: 600">外观样式</NText>

      <NFormItem label="字体颜色" style="margin-top: 8px">
        <NColorPicker
          v-model:value="currentTextColor"
          :modes="[colorPickerMode]"
          :show-alpha="false"
          size="small"
        />
      </NFormItem>

      <NFormItem label="背景颜色">
        <NColorPicker
          v-model:value="currentBgColor"
          :modes="[colorPickerMode]"
          :show-alpha="false"
          size="small"
        />
      </NFormItem>

      <NFormItem label="边框颜色">
        <NColorPicker
          v-model:value="currentBorderColor"
          :modes="[colorPickerMode]"
          :show-alpha="false"
          size="small"
        />
      </NFormItem>
    </NForm>

    <!-- 节点预设管理区 -->
    <NDivider style="margin: 8px 0" />
    <NText depth="3" class="section-title">节点预设</NText>

    <div class="preset-list">
      <div
        v-for="(preset, index) in presetsStore.nodePresets"
        :key="preset.id"
        class="preset-row"
        :class="{
          'is-dragging': draggedIndex === index,
          'is-drag-over': dragOverIndex === index && draggedIndex !== null && draggedIndex !== index,
        }"
        @click="applyPreset(preset)"
        @dragover="onDragOver(index, $event)"
        @drop="onDrop(index, $event)"
        @dragenter.prevent="dragOverIndex = index"
        @dragleave="onDragLeave(index, $event)"
      >
        <!-- 拖拽手柄 -->
        <span
          class="drag-handle"
          draggable="true"
          @dragstart.stop="onDragStart(index, $event)"
          @click.stop
        >
          ⋮⋮
        </span>

        <!-- 节点色块预览：28×28，显示名称首字 -->
        <div class="node-preview-block" @click.stop
          :style="{
            backgroundColor: preset.backgroundColor,
            borderColor: preset.borderColor,
            color: preset.textColor,
          }"
        >
          {{ preset.name.charAt(0) }}
        </div>

        <!-- 预设名称 -->
        <NText class="preset-name" depth="2">{{ preset.name }}</NText>

        <!-- 编辑按钮 -->
        <NButton
          size="tiny"
          quaternary
          class="action-btn"
          @click.stop="openEdit(preset)"
        >
          ✎
        </NButton>

        <!-- 删除按钮（带确认） -->
        <NPopconfirm @positive-click="handleDelete(preset)">
          <template #trigger>
            <NButton
              size="tiny"
              quaternary
              class="action-btn"
              @click.stop
            >
              ✕
            </NButton>
          </template>
          确定删除预设「{{ preset.name }}」？
        </NPopconfirm>
      </div>

      <!-- 空状态 -->
      <div v-if="presetsStore.nodePresets.length === 0" class="preset-empty">
        <NText depth="3">暂无预设</NText>
      </div>
    </div>

    <!-- 底部操作按钮 -->
    <div class="preset-actions">
      <NButton size="tiny" @click="openCreate">+ 新建预设</NButton>
      <NButton size="tiny" @click="openSaveCurrent">保存当前为预设</NButton>
    </div>

    <!-- 编辑 / 新建 / 保存为预设 Modal -->
    <NModal
      v-model:show="showModal"
      preset="card"
      :title="modalTitle"
      style="width: 380px"
    >
      <NForm label-placement="top" :show-feedback="false">
        <NFormItem label="名称">
          <NInput v-model:value="formName" placeholder="预设名称" />
        </NFormItem>
        <NFormItem label="背景色">
          <NColorPicker v-model:value="formBgColor" />
        </NFormItem>
        <NFormItem label="边框色">
          <NColorPicker v-model:value="formBorderColor" />
        </NFormItem>
        <NFormItem label="文字色">
          <NColorPicker v-model:value="formTextColor" />
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="modal-footer">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" @click="handleSave">保存</NButton>
        </div>
      </template>
    </NModal>
  </div>

  <div v-else class="property-empty">
    <NText depth="3" style="font-size: 13px">选中一个节点以编辑属性</NText>
  </div>
</template>

<style scoped>
.property-editor {
  padding: 8px 0;
}

.section-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin: 8px 0;
}

.multi-select-hint {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
}

.property-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  text-align: center;
}

/* ── 预设列表 ── */

.preset-list {
  max-height: 280px;
  overflow-y: auto;
  position: relative;
}

.preset-row {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  gap: 6px;
  position: relative;
  user-select: none;
}

.preset-row:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

.preset-row.is-dragging {
  opacity: 0.35;
}

.preset-row.is-drag-over::before {
  content: '';
  position: absolute;
  top: 0;
  left: 4px;
  right: 4px;
  height: 2px;
  background-color: #3b82f6;
  border-radius: 1px;
  pointer-events: none;
  z-index: 1;
}

.drag-handle {
  cursor: grab;
  color: #999;
  font-size: 14px;
  letter-spacing: -3px;
  padding: 0 2px;
  flex-shrink: 0;
  line-height: 1;
  user-select: none;
}

.drag-handle:hover {
  color: #555;
}

.drag-handle:active {
  cursor: grabbing;
}

.node-preview-block {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 2px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
}

.preset-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-btn {
  flex-shrink: 0;
}

.preset-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 60px;
}

.preset-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.preset-actions :deep(.n-button) {
  font-size: 12px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
