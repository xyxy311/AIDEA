<script setup lang="ts">
/**
 * NodePropertyEditor — 节点属性编辑面板
 *
 * 当选中节点时，可修改节点的文本内容和外观样式。
 */
import { ref, computed, nextTick } from 'vue'
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
import { useMessage } from 'naive-ui'
import { useActiveView } from '@/composables/useActiveView'
import { t } from '@/composables/useT'
import { usePresetsStore } from '@/stores/presets'
import { useThemeStore } from '@/stores/theme'
import { useNodeStore } from '@/stores/node'
import { deriveBackgroundColor } from '@/utils/color'
import { DEFAULT_NODE_STYLE } from '@/constants'
import { extractReferenceName } from '@/utils/reference'
import { useReferenceAutocomplete, type AutocompleteCandidate } from '@/composables/useReferenceAutocomplete'
import TextAutocomplete from '@/components/canvas/TextAutocomplete.vue'

const active = useActiveView()
const presetsStore = usePresetsStore()
const themeStore = useThemeStore()
const message = useMessage()
const nodeStore = useNodeStore()

// ── @ 补全 ──
/** 补全下拉共享逻辑 */
const autocomplete = useReferenceAutocomplete()
/** naive NInput 实例 ref（暴露内部 textareaElRef） */
const inputRef = ref()
/** 下拉定位（视口坐标） */
const dropdownPos = ref({ x: 0, y: 0 })
/** 重名冲突时强制 NInput 重建重读 get 值 */
const forceTextKey = ref(0)

/** 计算下拉位置：定位在内部 textarea 元素下方 */
function updateDropdownPos(): void {
  const ta = inputRef.value?.textareaElRef as HTMLTextAreaElement | undefined
  if (!ta) return
  const rect = ta.getBoundingClientRect()
  dropdownPos.value = { x: rect.left, y: rect.top + rect.height }
}

/** naive NInput @input 签名：接收 (value: string) */
function onNInputInput(value: string): void {
  const ta = inputRef.value?.textareaElRef as HTMLTextAreaElement | undefined
  const cursor = ta?.selectionStart ?? value.length
  autocomplete.handleInput(value, cursor)
  if (autocomplete.visible.value) updateDropdownPos()
}

/** 点击补全候选：插入引用名 */
function handleAutocompleteSelect(candidate: AutocompleteCandidate): void {
  const ta = inputRef.value?.textareaElRef as HTMLTextAreaElement | undefined
  const text = node.value?.text ?? ''
  const cursor = ta?.selectionStart ?? text.length
  const result = autocomplete.insertCandidate(text, cursor, candidate.name)
  currentText.value = result.insertedText
  autocomplete.close()
  nextTick(() => {
    const t = inputRef.value?.textareaElRef as HTMLTextAreaElement | undefined
    t?.setSelectionRange(result.newCursorPos, result.newCursorPos)
    t?.focus()
  })
}

/** naive NInput @keydown：处理补全键盘导航 */
function onNInputKeydown(e: KeyboardEvent): void {
  const ta = inputRef.value?.textareaElRef as HTMLTextAreaElement | undefined
  const text = currentText.value
  const cursor = ta?.selectionStart ?? text.length
  const result = autocomplete.handleKeydown(e, text, cursor)
  if (result === 'handled') return
  if (result !== 'unhandled' && typeof result === 'object') {
    e.preventDefault()
    currentText.value = result.insertedText // 触发 setter（插入的是已有引用名不会冲突）
    nextTick(() => {
      const t = inputRef.value?.textareaElRef as HTMLTextAreaElement | undefined
      t?.setSelectionRange(result.newCursorPos, result.newCursorPos)
    })
    return
  }
}

// 选中的节点信息
const node = computed(() => active.nodeStore.getNode(active.view.selectedNodeId))
const selectedCount = computed(() => active.view.selectedNodeIds.size)

const currentText = computed({
  get: () => node.value?.text ?? '',
  set: (val: string) => {
    if (!node.value) return
    // 校验引用名重名（单选时；多选时 setNodesText 会整体失败，这里也拦）
    const refName = extractReferenceName(val)
    const selectedId = active.view.selectedNodeId
    if (refName && selectedId && nodeStore.isReferenceNameTaken(refName, selectedId)) {
      autocomplete.close()
      message.warning(t('nodeEditor.referenceNameConflict', { name: refName }))
      // 回滚：通过 forceKey 强制 NInput 重新读取 get 值
      forceTextKey.value++
      return
    }
    active.updateSelectedNodesText(val)
  },
})

const currentBorderColor = computed({
  get: () => node.value?.borderColor ?? DEFAULT_NODE_STYLE.borderColor,
  set: (val: string | null) => {
    if (!node.value || !val) return
    active.updateSelectedNodesStyle({ borderColor: val })
  },
})

const colorPickerMode = 'hex' as const

// ── 节点预设管理 ──

/** 点击预设行 → 应用到选中节点 */
function applyPreset(preset: NodePresetStyle): void {
  active.updateSelectedNodesStyle({ borderColor: preset.borderColor })
}

/** 预设色块预览样式：背景由边框色派生，文字随主题 */
function previewStyle(preset: NodePresetStyle): Record<string, string> {
  return {
    backgroundColor: deriveBackgroundColor(preset.borderColor, themeStore.isDark),
    borderColor: preset.borderColor,
    color: themeStore.scheme.canvas.nodeTextColor,
  }
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
const formBorderColor = ref('#d1d5db')

function resetForm(): void {
  formName.value = ''
  formBorderColor.value = '#d1d5db'
}

function openEdit(preset: NodePresetStyle): void {
  editId.value = preset.id
  formName.value = preset.name
  formBorderColor.value = preset.borderColor
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
    formBorderColor.value = node.value.borderColor ?? '#d1d5db'
  }
  modalTitle.value = '保存为预设'
  showModal.value = true
}

function handleSave(): void {
  if (!formName.value.trim()) return
  if (editId.value) {
    presetsStore.updateNodePreset(editId.value, {
      name: formName.value.trim(),
      borderColor: formBorderColor.value,
    })
  } else {
    presetsStore.addNodePreset({
      name: formName.value.trim(),
      borderColor: formBorderColor.value,
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
        {{ t('nodeEditor.selectedCount', { count: selectedCount }) }}
      </NTag>
    </div>

    <NForm label-placement="top" size="small">
      <!-- 文本 -->
      <NFormItem :label="t('nodeEditor.textContent')">
        <NInput
          :key="forceTextKey"
          ref="inputRef"
          v-model:value="currentText"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          :placeholder="t('nodeEditor.textPlaceholder')"
          @input="onNInputInput"
          @keydown="onNInputKeydown"
        />
        <TextAutocomplete
          :visible="autocomplete.visible.value"
          :x="dropdownPos.x"
          :y="dropdownPos.y"
          :candidates="autocomplete.candidates.value"
          :active-index="autocomplete.activeIndex.value"
          @select="handleAutocompleteSelect"
          @close="autocomplete.close"
        />
      </NFormItem>

      <NDivider style="margin: 8px 0" />

      <!-- 外观样式 -->
      <NText depth="3" style="font-size: 12px; font-weight: 600">{{ t('nodeEditor.appearance') }}</NText>

      <NFormItem :label="t('nodeEditor.borderColor')">
        <NColorPicker
          v-model:value="currentBorderColor"
          :modes="[colorPickerMode]"
          :show-alpha="true"
          size="small"
        />
      </NFormItem>
    </NForm>

    <!-- 节点预设管理区 -->
    <NDivider style="margin: 8px 0" />
    <NText depth="3" class="section-title">{{ t('nodeEditor.presets') }}</NText>

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
          :style="previewStyle(preset)"
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
          {{ t('nodeEditor.deletePresetConfirm', { name: preset.name }) }}
        </NPopconfirm>
      </div>

      <!-- 空状态 -->
      <div v-if="presetsStore.nodePresets.length === 0" class="preset-empty">
        <NText depth="3">{{ t('nodeEditor.noPreset') }}</NText>
      </div>
    </div>

    <!-- 底部操作按钮 -->
    <div class="preset-actions">
      <NButton size="tiny" @click="openCreate">{{ t('nodeEditor.newPreset') }}</NButton>
      <NButton size="tiny" @click="openSaveCurrent">{{ t('nodeEditor.saveCurrentAsPreset') }}</NButton>
    </div>

    <!-- 编辑 / 新建 / 保存为预设 Modal -->
    <NModal
      v-model:show="showModal"
      preset="card"
      :title="modalTitle"
      style="width: 380px"
    >
      <NForm label-placement="top" :show-feedback="false">
        <NFormItem :label="t('nodeEditor.name')">
          <NInput v-model:value="formName" :placeholder="t('nodeEditor.presetNamePlaceholder')" />
        </NFormItem>
        <NFormItem :label="t('nodeEditor.presetBorderColor')">
          <NColorPicker v-model:value="formBorderColor" :show-alpha="true" />
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="modal-footer">
          <NButton @click="showModal = false">{{ t('nodeEditor.cancel') }}</NButton>
          <NButton type="primary" @click="handleSave">{{ t('nodeEditor.save') }}</NButton>
        </div>
      </template>
    </NModal>
  </div>

  <div v-else class="property-empty">
    <NText depth="3" style="font-size: 13px">{{ t('nodeEditor.selectNodeHint') }}</NText>
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
