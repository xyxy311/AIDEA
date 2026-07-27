<script setup lang="ts">
/**
 * PresetStyles — 预设样式管理面板
 *
 * 根据当前选中的元素类型自动切换显示节点预设或连线预设列表。
 * 支持拖拽排序、编辑、删除、新建以及将当前选中样式保存为预设。
 */
import { ref, computed } from 'vue'
import type { NodePresetStyle, ConnectionPresetStyle, LineStyle } from '@/types'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import { usePresetsStore } from '@/stores/presets'
import {
  NText,
  NButton,
  NDivider,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NColorPicker,
  NSelect,
  NSlider,
  NSwitch,
  NPopconfirm,
} from 'naive-ui'

const active = useActiveWhiteboard()
const presetsStore = usePresetsStore()

// ── 线型选项（用于表单下拉、连线预览） ──

const LINE_STYLE_OPTIONS: { label: string; value: LineStyle }[] = [
  { label: '实线', value: 'solid' },
  { label: '虚线', value: 'dashed' },
  { label: '点线', value: 'dotted' },
]

function getDashArray(style: LineStyle): string {
  if (style === 'solid') return ''
  if (style === 'dashed') return '6,4'
  return '2,3'
}

// ── 模式判断 ──
// 连线模式优先于节点模式（同一时间只能选中一种）

const isConnectionMode = computed(() => active.board.selectedConnectionIds.size !== 0)
const isNodeMode = computed(() => !isConnectionMode.value && active.board.selectedNodeIds.size !== 0)
const hasSelection = computed(() => isNodeMode.value || isConnectionMode.value)

const conn = computed(() => active.board.connections.get(active.board.selectedConnectionId))
const node = computed(() => active.board.nodes.get(active.board.selectedNodeId))
// ── 当前模式对应的预设列表 ──

const presets = computed<(NodePresetStyle | ConnectionPresetStyle)[]>(() => {
  if (isConnectionMode.value) return presetsStore.connectionPresets as unknown as ConnectionPresetStyle[]
  return presetsStore.nodePresets as unknown as NodePresetStyle[]
})

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

  if (isConnectionMode.value) {
    presetsStore.reorderConnectionPresets(fromIndex, index)
  } else {
    presetsStore.reorderNodePresets(fromIndex, index)
  }

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

// ── 点击应用预设 ──

function applyPreset(preset: NodePresetStyle | ConnectionPresetStyle): void {
  if (isConnectionMode.value && preset.type === 'connection') {
    active.board.updateSelectedConnectionsStyle(preset)
  } else if (isNodeMode.value && preset.type === 'node') {
    active.board.updateSelectedNodesStyle(preset)
  }
}

// ── 删除 ──

function handleDelete(preset: NodePresetStyle | ConnectionPresetStyle): void {
  if (preset.type === 'node') {
    presetsStore.deleteNodePreset(preset.id)
  } else {
    presetsStore.deleteConnectionPreset(preset.id)
  }
}

// ── Modal 表单 ──

const showModal = ref(false)
const modalTitle = ref('')
const editId = ref<string | null>(null)

// 表单字段
const formName = ref('')
const formBgColor = ref('#ffffff')
const formBorderColor = ref('#d1d5db')
const formTextColor = ref('#1f2937')
const formLineStyle = ref<LineStyle>('solid')
const formStrokeWidth = ref(2)
const formStrokeColor = ref('#6b7280')
const formDirected = ref(true)

function resetForm(): void {
  formName.value = ''
  formBgColor.value = '#ffffff'
  formBorderColor.value = '#d1d5db'
  formTextColor.value = '#1f2937'
  formLineStyle.value = 'solid'
  formStrokeWidth.value = 2
  formStrokeColor.value = '#6b7280'
  formDirected.value = true
}

function openEdit(preset: NodePresetStyle | ConnectionPresetStyle): void {
  editId.value = preset.id
  formName.value = preset.name

  if (preset.type === 'node') {
    formBgColor.value = preset.backgroundColor
    formBorderColor.value = preset.borderColor
    formTextColor.value = preset.textColor
  } else {
    formLineStyle.value = preset.lineStyle
    formStrokeWidth.value = preset.strokeWidth
    formStrokeColor.value = preset.strokeColor
    formDirected.value = preset.directed
  }

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

  if (isConnectionMode.value) {
    if (conn.value) {
      formLineStyle.value = conn.value.lineStyle
      formStrokeWidth.value = conn.value.strokeWidth
      formStrokeColor.value = conn.value.strokeColor
      formDirected.value = conn.value.directed
    }
  } else {
    if (node.value) {
      formBgColor.value = node.value.backgroundColor ?? '#ffffff'
      formBorderColor.value = node.value.borderColor ?? '#d1d5db'
      formTextColor.value = node.value.textColor ?? '#1f2937'
    }
  }

  modalTitle.value = '保存为预设'
  showModal.value = true
}

function handleSave(): void {
  if (!formName.value.trim()) return

  if (isConnectionMode.value) {
    if (editId.value) {
      presetsStore.updateConnectionPreset(editId.value, {
        name: formName.value.trim(),
        lineStyle: formLineStyle.value,
        strokeWidth: formStrokeWidth.value,
        strokeColor: formStrokeColor.value,
        directed: formDirected.value,
      })
    } else {
      presetsStore.addConnectionPreset({
        name: formName.value.trim(),
        lineStyle: formLineStyle.value,
        strokeWidth: formStrokeWidth.value,
        strokeColor: formStrokeColor.value,
        directed: formDirected.value,
      })
    }
  } else {
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
  }

  showModal.value = false
}
</script>

<template>
  <div v-if="hasSelection" class="preset-styles">
    <NDivider style="margin: 8px 0" />
    <NText depth="3" class="preset-title">
      {{ isConnectionMode ? '连线预设' : '节点预设' }}
    </NText>

    <div class="preset-list">
      <div
        v-for="(preset, index) in presets"
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

        <!-- 颜色/样式预览块 -->
        <div class="preset-preview" @click.stop>
          <!-- 节点预设预览：28×28 色块 -->
          <div
            v-if="preset.type === 'node'"
            class="node-preview-block"
            :style="{
              backgroundColor: preset.backgroundColor,
              borderColor: preset.borderColor,
              color: preset.textColor,
            }"
          >
            {{ preset.name.charAt(0) }}
          </div>
          <!-- 连线预设预览：56×14 水平线段 -->
          <svg
            v-else
            class="connection-preview-svg"
            width="56"
            height="14"
            viewBox="0 0 56 14"
          >
            <line
              x1="0"
              y1="7"
              x2="48"
              y2="7"
              :stroke="(preset as ConnectionPresetStyle).strokeColor"
              :stroke-width="Math.min((preset as ConnectionPresetStyle).strokeWidth, 5)"
              :stroke-dasharray="getDashArray((preset as ConnectionPresetStyle).lineStyle)"
              stroke-linecap="round"
            />
            <polygon
              v-if="(preset as ConnectionPresetStyle).directed"
              points="46,3 54,7 46,11"
              :fill="(preset as ConnectionPresetStyle).strokeColor"
            />
          </svg>
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
      <div v-if="presets.length === 0" class="preset-empty">
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

        <!-- 节点样式字段 -->
        <template v-if="!isConnectionMode">
          <NFormItem label="背景色">
            <NColorPicker v-model:value="formBgColor" />
          </NFormItem>
          <NFormItem label="边框色">
            <NColorPicker v-model:value="formBorderColor" />
          </NFormItem>
          <NFormItem label="文字色">
            <NColorPicker v-model:value="formTextColor" />
          </NFormItem>
        </template>

        <!-- 连线样式字段 -->
        <template v-else>
          <NFormItem label="线型">
            <NSelect
              v-model:value="formLineStyle"
              :options="LINE_STYLE_OPTIONS"
            />
          </NFormItem>
          <NFormItem label="粗细">
          <NSlider
            v-model:value="formStrokeWidth"
            :min="1"
            :max="10"
          />
          </NFormItem>
          <NFormItem label="颜色">
            <NColorPicker v-model:value="formStrokeColor" />
          </NFormItem>
          <NFormItem label="箭头">
            <NSwitch v-model:value="formDirected" />
          </NFormItem>
        </template>
      </NForm>

      <template #footer>
        <div class="modal-footer">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" @click="handleSave">保存</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.preset-styles {
  padding: 0 0 8px;
}

.preset-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin: 8px 0;
}

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

/* ⋮⋮ 拖拽手柄 */
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

/* 预览块容器 */
.preset-preview {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 节点预设预览：28×28 色块 */
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

/* 连线预设预览：SVG 线段 */
.connection-preview-svg {
  display: block;
  flex-shrink: 0;
}

/* 预设名称 — 单行溢出省略 */
.preset-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 操作按钮 */
.action-btn {
  flex-shrink: 0;
}

/* 空状态 */
.preset-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 60px;
}

/* 底部按钮组 */
.preset-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.preset-actions :deep(.n-button) {
  font-size: 12px;
}

/* Modal 底部按钮 */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
