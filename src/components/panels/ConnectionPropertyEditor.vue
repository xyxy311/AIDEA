<script setup lang="ts">
/**
 * ConnectionPropertyEditor — 连线属性编辑面板
 *
 * 当选中连线时，可修改该连线的线型、粗细、颜色和箭头开关。
 */
import { ref, computed } from 'vue'
import type { ConnectionPresetStyle, LineStyle } from '@/types'
import {
  NSelect,
  NSlider,
  NColorPicker,
  NSwitch,
  NForm,
  NFormItem,
  NText,
  NDivider,
  NTag,
  NButton,
  NInput,
  NModal,
  NPopconfirm,
} from 'naive-ui'
import { useActiveView } from '@/composables/useActiveView'
import { t } from '@/composables/useT'
import { usePresetsStore } from '@/stores/presets'
import {
  LINE_STYLE_OPTIONS,
  CONNECTION_MAX_STROKE_WIDTH,
} from '@/constants'

const active = useActiveView()
const presetsStore = usePresetsStore()

// 选中的连线信息
// 跨视图选中：选中连线可能来自主视图或任一内联视图宿主节点，按 ID 全局查找
const conn = computed(() => {
  const id = active.view.selectedConnectionId
  if (!id) return undefined
  return active.nodeStore.findConnectionById(id)?.connection
})
const selectedCount = computed(() => active.view.selectedConnectionIds.size)

/** 获取连线的两端节点名称 */
function getNodeLabel(nodeId: string): string {
  const node = active.nodeStore.getNode(nodeId)
  return node ? (node.text || t('connectionEditor.unnamedNode')) : nodeId
}

const lineStyle = computed<LineStyle | undefined>({
  get: () => conn.value?.lineStyle,
  set: (val) => {
    if (!conn.value || !val) return
    active.updateSelectedConnectionsStyle({ lineStyle: val })
  },
})

const strokeWidth = computed<number | undefined>({
  get: () => conn.value?.strokeWidth,
  set: (val) => {
    if (!conn.value || val === undefined) return
    active.updateSelectedConnectionsStyle({ strokeWidth: val })
  },
})

const strokeColor = computed<string | undefined>({
  get: () => conn.value?.strokeColor,
  set: (val) => {
    if (!conn.value || !val) return
    active.updateSelectedConnectionsStyle({ strokeColor: val })
  },
})

const directed = computed<boolean | undefined>({
  get: () => conn.value?.directed,
  set: (val) => {
    if (!conn.value || val === undefined) return
    active.updateSelectedConnectionsStyle({ directed: val })
  },
})

/** 连线文字标签（空字符串统一存为 null） */
const currentText = computed<string>({
  get: () => conn.value?.text ?? '',
  set: (val: string) => {
    if (!conn.value) return
    active.updateSelectedConnectionsStyle({ text: val || null })
  },
})

const colorPickerMode = 'hex' as const

// ── 连线预设管理 ──

/** 获取 SVG dasharray 字符串（用于预览，56px 宽线段需较小 dash） */
function getDashArray(style: LineStyle): string {
  if (style === 'solid') return ''
  if (style === 'dashed') return '6,4'
  return '2,3'
}

/** 点击预设行 → 应用到选中连线 */
function applyPreset(preset: ConnectionPresetStyle): void {
  active.updateSelectedConnectionsStyle(preset)
}

/** 删除预设 */
function handleDelete(preset: ConnectionPresetStyle): void {
  presetsStore.deleteConnectionPreset(preset.id)
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
  presetsStore.reorderConnectionPresets(fromIndex, index)
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
const formLineStyle = ref<LineStyle>('solid')
const formStrokeWidth = ref(2)
const formStrokeColor = ref('#6b7280')
const formDirected = ref(true)

function resetForm(): void {
  formName.value = ''
  formLineStyle.value = 'solid'
  formStrokeWidth.value = 2
  formStrokeColor.value = '#6b7280'
  formDirected.value = true
}

function openEdit(preset: ConnectionPresetStyle): void {
  editId.value = preset.id
  formName.value = preset.name
  formLineStyle.value = preset.lineStyle
  formStrokeWidth.value = preset.strokeWidth
  formStrokeColor.value = preset.strokeColor
  formDirected.value = preset.directed
  modalTitle.value = t('connectionEditor.editPreset')
  showModal.value = true
}

function openCreate(): void {
  editId.value = null
  resetForm()
  modalTitle.value = t('connectionEditor.newPresetTitle')
  showModal.value = true
}

function openSaveCurrent(): void {
  editId.value = null
  formName.value = ''
  if (conn.value) {
    formLineStyle.value = conn.value.lineStyle
    formStrokeWidth.value = conn.value.strokeWidth
    formStrokeColor.value = conn.value.strokeColor
    formDirected.value = conn.value.directed
  }
  modalTitle.value = t('connectionEditor.saveAsPreset')
  showModal.value = true
}

function handleSave(): void {
  if (!formName.value.trim()) return
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
      groupId: presetsStore.currentConnectionGroupId,
    })
  }
  showModal.value = false
}
</script>

<template>
  <div class="property-editor" v-if="conn">
    <!-- 多选提示 -->
    <div class="multi-select-hint">
      <NTag size="small" type="info" :bordered="false">
        {{ t('connectionEditor.selectedCount', { count: selectedCount }) }}
      </NTag>
    </div>

    <!-- 连线概览 -->
    <div class="connection-summary">
      <NTag size="small" :bordered="false" type="info">
        {{ getNodeLabel(conn.fromNodeId) }}
      </NTag>
      <span class="arrow-icon">→</span>
      <NTag size="small" :bordered="false" type="info">
        {{ getNodeLabel(conn.toNodeId) }}
      </NTag>
    </div>

    <NDivider style="margin: 8px 0" />

    <NForm label-placement="top" size="small">
      <NFormItem :label="t('connectionEditor.labelText')">
        <NInput
          v-model:value="currentText"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 3 }"
          :placeholder="t('connectionEditor.labelTextPlaceholder')"
        />
      </NFormItem>

      <NText depth="3" style="font-size: 12px; font-weight: 600">{{ t('connectionEditor.style') }}</NText>

      <NFormItem :label="t('connectionEditor.lineStyle')" style="margin-top: 8px">
        <NSelect
          v-model:value="lineStyle"
          :options="LINE_STYLE_OPTIONS"
          size="small"
          :placeholder="t('connectionEditor.lineStylePlaceholder')"
        />
      </NFormItem>

      <NFormItem label="粗细">
        <NSlider
          v-model:value="strokeWidth"
          :min="1"
          :max="CONNECTION_MAX_STROKE_WIDTH"
          :step="1"
          :format-tooltip="(v: number) => `${v}px`"
        />
      </NFormItem>

      <NFormItem label="颜色">
        <NColorPicker
          v-model:value="strokeColor"
          :modes="[colorPickerMode]"
          :show-alpha="false"
          size="small"
        />
      </NFormItem>

      <NFormItem :label="t('connectionEditor.directed')">
        <NSwitch
          v-model:value="directed"
          size="small"
        />
      </NFormItem>
    </NForm>

    <!-- 连线预设管理区 -->
    <NDivider style="margin: 8px 0" />
    <NText depth="3" class="section-title">{{ t('connectionEditor.presets') }}</NText>

    <div class="preset-list">
      <div
        v-for="(preset, index) in presetsStore.connectionPresets"
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

        <!-- 连线预览：56×14 SVG 线段 -->
        <svg
          class="connection-preview-svg"
          width="56"
          height="14"
          viewBox="0 0 56 14"
          @click.stop
        >
          <line
            x1="0"
            y1="7"
            x2="48"
            y2="7"
            :stroke="preset.strokeColor"
            :stroke-width="Math.min(preset.strokeWidth, 5)"
            :stroke-dasharray="getDashArray(preset.lineStyle)"
            stroke-linecap="round"
          />
          <polygon
            v-if="preset.directed"
            points="46,3 54,7 46,11"
            :fill="preset.strokeColor"
          />
        </svg>

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
          {{ t('connectionEditor.deletePresetConfirm', { name: preset.name }) }}
        </NPopconfirm>
      </div>

      <!-- 空状态 -->
      <div v-if="presetsStore.connectionPresets.length === 0" class="preset-empty">
        <NText depth="3">{{ t('connectionEditor.noPreset') }}</NText>
      </div>
    </div>

    <!-- 底部操作按钮 -->
    <div class="preset-actions">
      <NButton size="tiny" @click="openCreate">{{ t('connectionEditor.newPreset') }}</NButton>
      <NButton size="tiny" @click="openSaveCurrent">{{ t('connectionEditor.saveCurrentAsPreset') }}</NButton>
    </div>

    <!-- 编辑 / 新建 / 保存为预设 Modal -->
    <NModal
      v-model:show="showModal"
      preset="card"
      :title="modalTitle"
      style="width: 380px"
    >
      <NForm label-placement="top" :show-feedback="false">
        <NFormItem :label="t('connectionEditor.name')">
          <NInput v-model:value="formName" placeholder="预设名称" />
        </NFormItem>
        <NFormItem label="线型">
          <NSelect v-model:value="formLineStyle" :options="LINE_STYLE_OPTIONS" />
        </NFormItem>
      <NFormItem :label="t('connectionEditor.width')">
          <NSlider
            v-model:value="formStrokeWidth"
            :min="1"
            :max="CONNECTION_MAX_STROKE_WIDTH"
          />
        </NFormItem>
      <NFormItem :label="t('connectionEditor.color')">
          <NColorPicker v-model:value="formStrokeColor" />
        </NFormItem>
        <NFormItem label="箭头">
          <NSwitch v-model:value="formDirected" />
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
    <NText depth="3" style="font-size: 13px">选中一条连线以编辑属性</NText>
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

.property-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  text-align: center;
}

.connection-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  flex-wrap: wrap;
}

.arrow-icon {
  color: var(--color-text-3);
  font-weight: 600;
}

.multi-select-hint {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
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
  background-color: var(--color-hover);
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
  background-color: var(--color-primary);
  border-radius: 1px;
  pointer-events: none;
  z-index: 1;
}

.drag-handle {
  cursor: grab;
  color: var(--color-text-muted);
  font-size: 14px;
  letter-spacing: -3px;
  padding: 0 2px;
  flex-shrink: 0;
  line-height: 1;
  user-select: none;
}

.drag-handle:hover {
  color: var(--color-text-secondary);
}

.drag-handle:active {
  cursor: grabbing;
}

.connection-preview-svg {
  display: block;
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
