<script setup lang="ts">
/**
 * PresetManagerPanel — 预设管理面板（左侧活动栏面板）
 *
 * 集中管理节点预设与连线预设，额外支持"分组"：
 * - 顶部 Tab 在节点 / 连线之间切换（分组筛选共享）
 * - 下拉框切换分组视图（全部 / 未分组 / 各用户{内置分组}）
 * - 列表遍历可见预设（visibleNodePresets / visibleConnectionPresets），
 *   支持 HTML5 拖拽排序（可见列表内重排）、序号徽标（1-9 快捷键提示）、
 *   预览、分组标签、编辑 / 删除
 * - 点击行将预设应用到当前选中项
 * - 底部：新建预设 / 保存当前为预设
 * - 分组管理弹窗：新增 / 改名 / 删除分组
 *
 * 数据层全部消费 presets store，不修改 store / types / constants。
 */
import { ref, computed } from 'vue'
import {
  NSelect,
  NInput,
  NButton,
  NColorPicker,
  NTag,
  NModal,
  NPopconfirm,
  NSwitch,
  NSlider,
  NForm,
  NFormItem,
  NText,
  NScrollbar,
  useMessage,
} from 'naive-ui'
import type { NodePresetStyle, ConnectionPresetStyle, LineStyle } from '@/types'
import { usePresetsStore } from '@/stores/presets'
import { useThemeStore } from '@/stores/theme'
import { useActiveView } from '@/composables/useActiveView'
import { t } from '@/composables/useT'
import { deriveBackgroundColor } from '@/utils/color'
import { LINE_STYLE_OPTIONS, CONNECTION_MAX_STROKE_WIDTH } from '@/constants'

const presetsStore = usePresetsStore()
const themeStore = useThemeStore()
const active = useActiveView()
const message = useMessage()

type PresetType = 'node' | 'connection'

/** 当前类型 tab */
const activeType = ref<PresetType>('node')

/** 当前类型对应的可见预设列表 */
const visiblePresets = computed<(NodePresetStyle | ConnectionPresetStyle)[]>(() =>
  activeType.value === 'node'
    ? presetsStore.visibleNodePresets
    : presetsStore.visibleConnectionPresets,
)

/** 空状态文案：全部视图与分组视图区分（按当前类型的分组筛选判断） */
const emptyMessage = computed(() => {
  const f =
    activeType.value === 'node'
      ? presetsStore.nodeGroupFilter
      : presetsStore.connectionGroupFilter
  return f === 'all' ? t('presetPanel.noPreset') : t('presetPanel.noPresetInGroup')
})

// ── 分组筛选下拉 ──

/** 当前类型对应的分组列表（节点 / 连线分组完全独立） */
const currentGroups = computed(() =>
  activeType.value === 'node' ? presetsStore.nodeGroups : presetsStore.connectionGroups,
)

const groupFilterOptions = computed(() => [
  { label: t('presetPanel.allPresets'), value: 'all' },
  { label: t('presetPanel.ungrouped'), value: 'ungrouped' },
  ...currentGroups.value.map((g) => ({ label: g.name, value: g.id })),
])

function handleFilterChange(value: string): void {
  if (activeType.value === 'node') presetsStore.setNodeGroupFilter(value)
  else presetsStore.setConnectionGroupFilter(value)
}

// ── 选中项（用于应用预设 / 保存当前为预设） ──

const selectedNode = computed(() => {
  const id = active.view.selectedNodeId
  return id ? active.nodeStore.getNode(id) : undefined
})

const selectedConn = computed(() => {
  const id = active.view.selectedConnectionId
  return id ? active.nodeStore.findConnectionById(id)?.connection : undefined
})

/** 保存当前为预设是否可用（对应类型有选中项） */
const canSaveCurrent = computed(
  () => (activeType.value === 'node' ? !!selectedNode.value : !!selectedConn.value),
)

// ── 应用预设到选中项 ──

function applyPreset(preset: NodePresetStyle | ConnectionPresetStyle): void {
  if (preset.type === 'node') {
    if (!selectedNode.value) {
      message.info(t('presetPanel.noSelection'))
      return
    }
    active.updateSelectedNodesStyle({ borderColor: preset.borderColor })
  } else {
    if (!selectedConn.value) {
      message.info(t('presetPanel.noSelection'))
      return
    }
    const p = preset as ConnectionPresetStyle
    active.updateSelectedConnectionsStyle({
      lineStyle: p.lineStyle,
      strokeWidth: p.strokeWidth,
      strokeColor: p.strokeColor,
      directed: p.directed,
    })
  }
}

// ── 预览 ──

/** 节点色块预览样式：背景由边框色派生，文字随主题 */
function previewStyle(preset: NodePresetStyle): Record<string, string> {
  return {
    backgroundColor: deriveBackgroundColor(preset.borderColor, themeStore.isDark),
    borderColor: preset.borderColor,
    color: themeStore.scheme.canvas.nodeTextColor,
  }
}

/** 获取连线 SVG dasharray（预览用，56px 宽需较小 dash） */
function getDashArray(style: LineStyle): string {
  if (style === 'solid') return ''
  if (style === 'dashed') return '6,4'
  return '2,3'
}

/** 分组标签：未分组返回 null（省略展示） */
function groupTagLabel(preset: NodePresetStyle | ConnectionPresetStyle): string | null {
  return presetsStore.groupName(preset.type, preset.groupId)
}

// ── 删除 ──

function handleDelete(preset: NodePresetStyle | ConnectionPresetStyle): void {
  if (preset.type === 'node') presetsStore.deleteNodePreset(preset.id)
  else presetsStore.deleteConnectionPreset(preset.id)
}

// ── 拖拽排序（可见列表内） ──

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
  const fromIndex = draggedIndex.value
  if (fromIndex === null) {
    dragOverIndex.value = null
    return
  }
  if (fromIndex !== index) {
    if (activeType.value === 'node') presetsStore.reorderVisibleNodePresets(fromIndex, index)
    else presetsStore.reorderVisibleConnectionPresets(fromIndex, index)
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
    if (dragOverIndex.value === index) dragOverIndex.value = null
  }
}

// ── 预设 Modal 表单 ──

const UNGROUPED_VALUE = '__ungrouped__'

const showPresetModal = ref(false)
const presetModalMode = ref<'create' | 'edit'>('create')
const editId = ref<string | null>(null)
const formName = ref('')
const formBorderColor = ref('#d1d5db')
const formLineStyle = ref<LineStyle>('solid')
const formStrokeWidth = ref(2)
const formStrokeColor = ref('#6b7280')
const formDirected = ref(true)
const formGroupId = ref<string>(UNGROUPED_VALUE)

/** 预设分组下拉：未分组 + 当前类型分组（含内置，便于编辑内置预设） */
const presetGroupOptions = computed(() => [
  { label: t('presetPanel.ungrouped'), value: UNGROUPED_VALUE },
  ...currentGroups.value.map((g) => ({ label: g.name, value: g.id })),
])

function resolveGroupId(v: string): string | null {
  return v === UNGROUPED_VALUE ? null : v
}

function resetPresetForm(): void {
  formName.value = ''
  formBorderColor.value = '#d1d5db'
  formLineStyle.value = 'solid'
  formStrokeWidth.value = 2
  formStrokeColor.value = '#6b7280'
  formDirected.value = true
  formGroupId.value = defaultPresetGroupId()
}

/** 新建预设的默认分组：按当前类型取对应分组 id */
function defaultPresetGroupId(): string {
  const id =
    activeType.value === 'node'
      ? presetsStore.currentNodeGroupId
      : presetsStore.currentConnectionGroupId
  return id ?? UNGROUPED_VALUE
}

function openCreate(): void {
  presetModalMode.value = 'create'
  editId.value = null
  resetPresetForm()
  showPresetModal.value = true
}

function openEdit(preset: NodePresetStyle | ConnectionPresetStyle): void {
  presetModalMode.value = 'edit'
  editId.value = preset.id
  formName.value = preset.name
  formGroupId.value = preset.groupId ?? UNGROUPED_VALUE
  if (preset.type === 'node') {
    formBorderColor.value = preset.borderColor
  } else {
    formLineStyle.value = preset.lineStyle
    formStrokeWidth.value = preset.strokeWidth
    formStrokeColor.value = preset.strokeColor
    formDirected.value = preset.directed
  }
  showPresetModal.value = true
}

function openSaveCurrent(): void {
  presetModalMode.value = 'create'
  editId.value = null
  formName.value = ''
  formGroupId.value = defaultPresetGroupId()
  if (activeType.value === 'node') {
    formBorderColor.value = selectedNode.value?.borderColor ?? '#d1d5db'
  } else if (selectedConn.value) {
    formLineStyle.value = selectedConn.value.lineStyle
    formStrokeWidth.value = selectedConn.value.strokeWidth
    formStrokeColor.value = selectedConn.value.strokeColor
    formDirected.value = selectedConn.value.directed
  }
  showPresetModal.value = true
}

function handleSavePreset(): void {
  if (!formName.value.trim()) return
  const name = formName.value.trim()
  const groupId = resolveGroupId(formGroupId.value)
  if (activeType.value === 'node') {
    if (editId.value) {
      presetsStore.updateNodePreset(editId.value, { name, borderColor: formBorderColor.value, groupId })
    } else {
      presetsStore.addNodePreset({ name, borderColor: formBorderColor.value, groupId })
    }
  } else {
    if (editId.value) {
      presetsStore.updateConnectionPreset(editId.value, {
        name,
        lineStyle: formLineStyle.value,
        strokeWidth: formStrokeWidth.value,
        strokeColor: formStrokeColor.value,
        directed: formDirected.value,
        groupId,
      })
    } else {
      presetsStore.addConnectionPreset({
        name,
        lineStyle: formLineStyle.value,
        strokeWidth: formStrokeWidth.value,
        strokeColor: formStrokeColor.value,
        directed: formDirected.value,
        groupId,
      })
    }
  }
  showPresetModal.value = false
}

// ── 分组管理 ──

const showGroupModal = ref(false)

/** 是否显示分组名输入弹窗（新增 + 改名共用） */
const showGroupNameModal = ref(false)
const groupNameMode = ref<'add' | 'edit'>('add')
const editingGroupId = ref<string | null>(null)
const formGroupName = ref('')
/** 从预设弹窗内触发的"新建分组"：保存后需把新分组设为预设分组选中值 */
const newGroupToPresetForm = ref(false)

function openManageGroups(): void {
  showGroupModal.value = true
}

function openAddGroup(): void {
  groupNameMode.value = 'add'
  editingGroupId.value = null
  formGroupName.value = ''
  newGroupToPresetForm.value = false
  showGroupNameModal.value = true
}

/** 从预设 Modal 内触发新建分组：保存后把新分组设为预设分组选中值 */
function openAddGroupFromPreset(): void {
  groupNameMode.value = 'add'
  editingGroupId.value = null
  formGroupName.value = ''
  newGroupToPresetForm.value = true
  showGroupNameModal.value = true
}

function openEditGroup(id: string, name: string): void {
  groupNameMode.value = 'edit'
  editingGroupId.value = id
  formGroupName.value = name
  showGroupNameModal.value = true
}

function handleSaveGroupName(): void {
  const name = formGroupName.value.trim()
  if (!name) return
  if (groupNameMode.value === 'add') {
    const g = presetsStore.addGroup(activeType.value, name)
    if (newGroupToPresetForm.value) formGroupId.value = g.id
  } else if (editingGroupId.value) {
    presetsStore.updateGroup(activeType.value, editingGroupId.value, name)
  }
  newGroupToPresetForm.value = false
  showGroupNameModal.value = false
}

function handleDeleteGroup(id: string): void {
  presetsStore.deleteGroup(activeType.value, id)
}
</script>

<template>
  <div class="preset-panel">
    <!-- 面板标题栏 -->
    <div class="panel-header">
      <span class="panel-title">{{ t('leftSidebar.presets') }}</span>
    </div>

    <!-- 类型切换（分段按钮） -->
    <div class="tab-switch">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeType === 'node' }"
        @click="activeType = 'node'"
      >
        {{ t('presetPanel.nodeTab') }}
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeType === 'connection' }"
        @click="activeType = 'connection'"
      >
        {{ t('presetPanel.connectionTab') }}
      </button>
    </div>

    <!-- 分组筛选 + 管理 -->
    <div class="filter-row">
      <NSelect
        :value="activeType === 'node' ? presetsStore.nodeGroupFilter : presetsStore.connectionGroupFilter"
        :options="groupFilterOptions"
        size="small"
        class="group-filter"
        @update:value="handleFilterChange"
      />
      <NButton size="tiny" quaternary class="manage-btn" @click="openManageGroups">
        {{ t('presetPanel.manageGroups') }}
      </NButton>
    </div>

    <!-- 底部操作（新建 / 保存当前为预设） -->
    <div class="preset-actions">
      <NButton size="tiny" @click="openCreate">{{ t('presetPanel.newPreset') }}</NButton>
      <NButton size="tiny" :disabled="!canSaveCurrent" @click="openSaveCurrent">
        {{ t('presetPanel.saveCurrentAsPreset') }}
      </NButton>
    </div>

    <!-- 预设列表 -->
    <NScrollbar class="preset-scroll">
      <div class="preset-list">
        <div
          v-for="(preset, index) in visiblePresets"
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
          @dragend="onDragEnd"
        >
          <!-- 拖拽手柄 -->
          <span
            class="drag-handle"
            draggable="true"
            @dragstart.stop="onDragStart(index, $event)"
            @dragend.stop="onDragEnd"
            @click.stop
          >
            ⋮⋮
          </span>

          <!-- 序号徽标（快捷键 1-9，仅前 9 项） -->
          <span v-if="index < 9" class="shortcut-badge" :title="t('presetPanel.shortcut')">
            {{ index + 1 }}
          </span>

          <!-- 节点色块预览 -->
          <div v-if="preset.type === 'node'" class="node-preview-block" @click.stop
            :style="previewStyle(preset)"
          >
            {{ preset.name.charAt(0) }}
          </div>

          <!-- 连线迷你预览 -->
          <svg
            v-else
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
            <polygon v-if="preset.directed" points="46,3 54,7 46,11" :fill="preset.strokeColor" />
          </svg>

          <!-- 名称 -->
          <NText class="preset-name" depth="2">{{ preset.name }}</NText>

          <!-- 分组标签 -->
          <NTag
            v-if="groupTagLabel(preset)"
            size="tiny"
            :bordered="false"
            class="group-tag"
          >
            {{ groupTagLabel(preset) }}
          </NTag>

          <!-- 编辑 -->
          <NButton size="tiny" quaternary class="action-btn" @click.stop="openEdit(preset)">
            ✎
          </NButton>

          <!-- 删除（带确认） -->
          <NPopconfirm :positive-text="t('presetPanel.confirm')" :negative-text="t('presetPanel.cancel')" @positive-click="handleDelete(preset)">
            <template #trigger>
              <NButton size="tiny" quaternary class="action-btn" @click.stop>✕</NButton>
            </template>
            {{ t('presetPanel.deletePresetConfirm', { name: preset.name }) }}
          </NPopconfirm>
        </div>

        <!-- 空状态 -->
        <div v-if="visiblePresets.length === 0" class="preset-empty">
          <NText depth="3">{{ emptyMessage }}</NText>
        </div>
      </div>
    </NScrollbar>

    <!-- 新建 / 编辑 / 保存当前为预设 Modal -->
    <NModal
      v-model:show="showPresetModal"
      preset="card"
      :title="presetModalMode === 'edit' ? t('presetPanel.editPreset') : t('presetPanel.newPreset')"
      style="width: 380px"
    >
      <NForm label-placement="top" :show-feedback="false">
        <NFormItem :label="t('presetPanel.name')">
          <NInput v-model:value="formName" :placeholder="t('presetPanel.presetNamePlaceholder')" />
        </NFormItem>

        <!-- 节点字段 -->
        <template v-if="activeType === 'node'">
          <NFormItem :label="t('presetPanel.presetBorderColor')">
            <NColorPicker v-model:value="formBorderColor" :show-alpha="true" />
          </NFormItem>
        </template>

        <!-- 连线字段 -->
        <template v-else>
          <NFormItem :label="t('connectionEditor.lineStyle')">
            <NSelect v-model:value="formLineStyle" :options="LINE_STYLE_OPTIONS" />
          </NFormItem>
          <NFormItem :label="t('connectionEditor.width')">
            <NSlider v-model:value="formStrokeWidth" :min="1" :max="CONNECTION_MAX_STROKE_WIDTH" />
          </NFormItem>
          <NFormItem :label="t('connectionEditor.color')">
            <NColorPicker v-model:value="formStrokeColor" />
          </NFormItem>
          <NFormItem :label="t('connectionEditor.directed')">
            <NSwitch v-model:value="formDirected" />
          </NFormItem>
        </template>

        <!-- 分组选择 -->
        <NFormItem :label="t('presetPanel.group')">
          <div class="group-field-row">
            <NSelect v-model:value="formGroupId" :options="presetGroupOptions" class="group-field-select" />
            <NButton size="tiny" @click="openAddGroupFromPreset">{{ t('presetPanel.addGroup') }}</NButton>
          </div>
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="modal-footer">
          <NButton @click="showPresetModal = false">{{ t('presetPanel.cancel') }}</NButton>
          <NButton type="primary" @click="handleSavePreset">{{ t('presetPanel.save') }}</NButton>
        </div>
      </template>
    </NModal>

    <!-- 分组管理 Modal -->
    <NModal
      v-model:show="showGroupModal"
      preset="card"
      :title="t('presetPanel.manageGroups')"
      style="width: 360px"
    >
      <div class="group-manage">
        <div class="group-manage-actions">
          <NButton size="tiny" @click="openAddGroup">{{ t('presetPanel.addGroup') }}</NButton>
        </div>

        <div class="group-list">
          <div v-for="g in currentGroups" :key="g.id" class="group-row">
            <NText class="group-name" depth="2">{{ g.name }}</NText>
            <NTag v-if="g.builtin" size="tiny" :bordered="false" class="builtin-tag">
              {{ t('presetPanel.builtin') }}
            </NTag>
            <div class="group-actions">
              <NButton
                size="tiny"
                quaternary
                class="action-btn"
                :disabled="g.builtin"
                @click="openEditGroup(g.id, g.name)"
              >
                ✎
              </NButton>
              <NPopconfirm
                :positive-text="t('presetPanel.confirm')"
                :negative-text="t('presetPanel.cancel')"
                :disabled="g.builtin"
                @positive-click="handleDeleteGroup(g.id)"
              >
                <template #trigger>
                  <NButton size="tiny" quaternary class="action-btn" :disabled="g.builtin">✕</NButton>
                </template>
                {{ t('presetPanel.deleteGroupConfirm', { name: g.name }) }}
              </NPopconfirm>
            </div>
          </div>
        </div>

        <div class="builtin-hint">
          <NText depth="3" style="font-size: 12px">{{ t('presetPanel.builtinGroupHint') }}</NText>
        </div>
      </div>
    </NModal>

    <!-- 分组名称输入 Modal（新增 / 改名共用） -->
    <NModal
      v-model:show="showGroupNameModal"
      preset="card"
      :title="groupNameMode === 'edit' ? t('presetPanel.editGroup') : t('presetPanel.addGroup')"
      style="width: 320px"
    >
      <NForm label-placement="top" :show-feedback="false">
        <NFormItem :label="t('presetPanel.groupName')">
          <NInput v-model:value="formGroupName" :placeholder="t('presetPanel.groupNamePlaceholder')" />
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="modal-footer">
          <NButton @click="showGroupNameModal = false">{{ t('presetPanel.cancel') }}</NButton>
          <NButton type="primary" @click="handleSaveGroupName">{{ t('presetPanel.save') }}</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.preset-panel {
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
}

/* 类型切换 */
.tab-switch {
  display: flex;
  gap: 2px;
  margin: 8px;
  padding: 2px;
  background: var(--color-hover);
  border-radius: 6px;
}

.tab-btn {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  padding: 4px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tab-btn:hover {
  color: var(--color-text);
}

.tab-btn.active {
  background: var(--color-surface);
  color: var(--color-primary);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

/* 分组筛选行 */
.filter-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px 8px;
}

.group-filter {
  flex: 1;
  min-width: 0;
}

.manage-btn {
  flex-shrink: 0;
  font-size: 12px;
  padding: 0 6px;
}

/* 预设列表 */
.preset-scroll {
  flex: 1;
}

.preset-list {
  padding: 4px;
}

.preset-row {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  gap: 5px;
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

/* 序号徽标（快捷键 1-9） */
.shortcut-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: var(--color-primary-faint);
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
  line-height: 1;
}

.node-preview-block {
  width: 26px;
  height: 26px;
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

.group-tag {
  flex-shrink: 0;
  max-width: 48px;
  font-size: 10px;
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

/* 底部操作（新建 / 保存当前为预设） */
.preset-actions {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid var(--color-border);
}

.preset-actions :deep(.n-button) {
  font-size: 12px;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 预设 Modal 分组选择行 */
.group-field-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.group-field-select {
  flex: 1;
  min-width: 0;
}

/* 分组管理 */
.group-manage {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-manage-actions {
  display: flex;
  justify-content: flex-end;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 320px;
  overflow-y: auto;
}

.group-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 4px;
}

.group-row:hover {
  background-color: var(--color-hover);
}

.group-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.builtin-tag {
  flex-shrink: 0;
  font-size: 10px;
}

.group-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.builtin-hint {
  padding: 6px 4px 0;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
}
</style>