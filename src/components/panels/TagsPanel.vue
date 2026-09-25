<script setup lang="ts">
/**
 * TagsPanel - 标签管理面板：集中管理项目级标签定义（名称+颜色）。
 * 顶部快速新建；列表每行色块可直接改色 + 改名/删除；空状态 NEmpty。
 * 标签定义为项目级数据（CRUD 不可撤销），"节点打上标签"在右侧属性面板操作。数据层全消费 tags store。
 */
import { ref, computed } from 'vue'
import { NInput, NButton, NColorPicker, NModal, NForm, NFormItem, NText, NScrollbar, NPopconfirm, NEmpty } from 'naive-ui'
import { useMessage } from 'naive-ui'
import DraggableSortList from '@/components/common/DraggableSortList.vue'
import { useTagsStore } from '@/stores/tags'
import { useActiveView } from '@/composables/useActiveView'
import { t } from '@/composables/useT'
import type { Tag, WhiteboardNode } from '@/types'

const tagsStore = useTagsStore()
const active = useActiveView()
const message = useMessage()

// ── 顶部快速新建 ──

const newName = ref('')
/** 快速新建的默认颜色（浅色系便于观感） */
const newColor = ref('#4fc3f7')

function handleQuickAdd(): void {
  const name = newName.value.trim()
  if (!name) {
    message.warning(t('tagsPanel.nameRequired'))
    return
  }
  tagsStore.addTag(name, newColor.value)
  newName.value = ''
  // 下次新建换一个相近色，避免全部同色（简单轮换几个预设色）
  newColor.value = nextQuickColor()
}

// ── 改名 / 编辑 Modal ──

const showModal = ref(false)
const editId = ref<string | null>(null)
const formName = ref('')
const formColor = ref('#4fc3f7')

function openEdit(id: string): void {
  const tag = tagsStore.getTag(id)
  if (!tag) return
  editId.value = id
  formName.value = tag.name
  formColor.value = tag.color
  showModal.value = true
}

function handleSave(): void {
  const name = formName.value.trim()
  if (!name) {
    message.warning(t('tagsPanel.nameRequired'))
    return
  }
  if (!editId.value) return
  tagsStore.renameTag(editId.value, name)
  tagsStore.updateTagColor(editId.value, formColor.value)
  showModal.value = false
}

// ── 列表内直接改色 ──

function handleColorChange(tagId: string, color: string | null): void {
  if (!color) return
  tagsStore.updateTagColor(tagId, color)
}

// ── 删除 ──

function handleDelete(id: string): void {
  tagsStore.deleteTag(id)
}

// ── 点击标签项：为选中节点添加/移除标签（走命令层可撤销，各节点保留原有其它标签） ──

/** 当前全部选中节点（支持多选；未选中为空数组） */
const selectedNodes = computed<WhiteboardNode[]>(() => {
  const view = active.view
  return Array.from(view.selectedNodeIds)
    .map((id) => active.nodeStore.getNode(id))
    .filter((n): n is WhiteboardNode => !!n)
})

/** 该标签在所有选中节点上的应用状态：全含 / 部分含 / 都不含 */
function tagState(tag: Tag): 'all' | 'partial' | 'none' {
  const nodes = selectedNodes.value
  if (nodes.length === 0) return 'none'
  let has = 0
  for (const n of nodes) {
    if ((n.tagIds ?? []).includes(tag.id)) has++
  }
  if (has === nodes.length) return 'all'
  return has > 0 ? 'partial' : 'none'
}

/**
 * 点击标签项：为所有选中节点批量添加/移除该标签（走命令层可撤销）。
 * 全部已含 -> 移除；否则 -> 添加；各节点保留自己的其它标签。
 */
function toggleTagForSelected(tag: Tag): void {
  const nodes = selectedNodes.value
  if (nodes.length === 0) {
    message.info(t('tagsPanel.noSelection'))
    return
  }
  const apply = tagState(tag) !== 'all'
  const perNode = nodes.map((n) => {
    const cur = n.tagIds ?? []
    const has = cur.includes(tag.id)
    if (apply) return has ? cur : [...cur, tag.id]
    return has ? cur.filter((id) => id !== tag.id) : cur
  })
  active.updateSelectedNodesTagsPerNode(perNode)
}

// ── 拖拽排序 ──

function handleReorderTags(fromIndex: number, toIndex: number): void {
  tagsStore.reorderTag(fromIndex, toIndex)
}

// ── 快速新建颜色轮换 ──

const QUICK_COLORS = ['#4fc3f7', '#4ade80', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#60a5fa', '#34d399']

function nextQuickColor(): string {
  const cur = QUICK_COLORS.indexOf(newColor.value)
  return QUICK_COLORS[(cur + 1) % QUICK_COLORS.length]
}
</script>

<template>
  <div class="tags-panel">
    <!-- 顶部快速新建 -->
    <div class="quick-add">
      <NInput
        v-model:value="newName"
        size="small"
        class="tag-name-input"
        :placeholder="t('tagsPanel.tagNamePlaceholder')"
        @keyup.enter="handleQuickAdd"
      />
      <div class="quick-add-actions">
        <NColorPicker
          v-model:value="newColor"
          :show-alpha="false"
          size="small"
          class="tag-color-pick"
          :title="t('tagsPanel.tagColor')"
        />
        <NButton size="small" type="primary" class="add-btn" @click="handleQuickAdd">
          {{ t('tagsPanel.addTag') }}
        </NButton>
      </div>
    </div>

    <!-- 标签列表 -->
    <NScrollbar class="tags-scroll">
      <DraggableSortList
        :items="tagsStore.tagList"
        :show-shortcut-badge="false"
        @reorder="handleReorderTags"
      >
        <template #default="{ item: tag }">
          <!-- 主体（色点 + 名称）：点击为选中节点添加/移除该标签 -->
          <div
            class="tag-body"
            :class="{ active: tagState(tag) === 'all', partial: tagState(tag) === 'partial' }"
            :title="t('tagsPanel.applyToSelected')"
            @click="toggleTagForSelected(tag)"
          >
            <!-- 色点（点击弹改色选择器）：.stop 隔离，避免误触发打标签 -->
            <NColorPicker
              :value="tag.color"
              :show-alpha="false"
              size="small"
              :title="t('tagsPanel.tagColor')"
              @update:value="(v) => handleColorChange(tag.id, v)"
            >
              <template #trigger="{ onClick }">
                <span
                  class="tag-dot"
                  :style="{ backgroundColor: tag.color }"
                  @click.stop="onClick"
                />
              </template>
            </NColorPicker>
            <NText class="tag-name" depth="2">{{ tag.name }}</NText>
          </div>
          <NButton size="tiny" quaternary class="action-btn" @click="openEdit(tag.id)">
            ✎
          </NButton>
          <NPopconfirm
            :positive-text="t('tagsPanel.confirm')"
            :negative-text="t('tagsPanel.cancel')"
            @positive-click="handleDelete(tag.id)"
          >
            <template #trigger>
              <NButton size="tiny" quaternary class="action-btn">✕</NButton>
            </template>
            {{ t('tagsPanel.deleteTagConfirm', { name: tag.name }) }}
          </NPopconfirm>
        </template>

        <template #empty>
          <div class="tag-empty">
            <NEmpty :description="t('tagsPanel.empty')" size="small" />
          </div>
        </template>
      </DraggableSortList>
    </NScrollbar>

    <!-- 新建 / 改名 Modal -->
    <NModal
      v-model:show="showModal"
      preset="card"
      :title="t('tagsPanel.editTag')"
      style="width: 340px"
    >
      <NForm label-placement="top" :show-feedback="false">
        <NFormItem :label="t('tagsPanel.tagName')">
          <NInput v-model:value="formName" :placeholder="t('tagsPanel.tagNamePlaceholder')" />
        </NFormItem>
        <NFormItem :label="t('tagsPanel.tagColor')">
          <NColorPicker v-model:value="formColor" :show-alpha="false" />
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="modal-footer">
          <NButton @click="showModal = false">{{ t('tagsPanel.cancel') }}</NButton>
          <NButton type="primary" @click="handleSave">{{ t('tagsPanel.save') }}</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.tags-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* 顶部快速新建：名称输入独占一行，颜色 + 添加按钮在下一行 */
.quick-add {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
}

.tag-name-input {
  width: 100%;
}

.quick-add-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tag-color-pick {
  /* 用 flex-basis 强制固定宽度，覆盖 NColorPicker 自身的 width:100%，避免撑满/挤压 */
  flex: 0 0 40px;
  width: 40px;
}

.add-btn {
  flex-shrink: 0;
}

/* 标签列表 */
.tags-scroll {
  flex: 1;
}

/* 可点击主体（色点 + 名称）：点击为选中节点添加/移除该标签 */
.tag-body {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
  border-radius: 4px;
  padding: 0 2px;
  cursor: pointer;
}

.tag-body:hover {
  background-color: var(--color-hover);
}

/* 当前选中节点已含该标签：高亮提示 */
.tag-body.active {
  background-color: var(--color-primary-faint);
}

/* 部分选中节点含该标签：弱化高亮提示 */
.tag-body.partial {
  background-color: var(--color-primary-faint);
  opacity: 0.55;
}

/* 色点（列表行内固定小圆点）：纯色、不占多余空间、不挤压名称 */
.tag-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex: 0 0 14px;
  flex-shrink: 0;
  cursor: pointer;
  border: 1px solid var(--color-border);
  box-sizing: border-box;
  transition: transform 0.15s;
}

.tag-dot:hover {
  transform: scale(1.15);
}

.tag-name {
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

.tag-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 32px 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>