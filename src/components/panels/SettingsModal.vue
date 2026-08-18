<script setup lang="ts">
/**
 * SettingsModal — 设置面板
 *
 * 窗口式外观，不可拖拽移动，仅 UI 占位。
 */
import {
  NModal,
  NCard,
  NDivider,
  NSwitch,
  NSpace,
  NText,
  NRadioGroup,
  NRadioButton,
  NButton,
  NSelect,
  NInput,
  NForm,
  NFormItem,
  NTag,
  NScrollbar,
  NEmpty,
  NPopconfirm,
  NIcon,
  useDialog,
} from 'naive-ui'
import type { FormInst, FormRules } from 'naive-ui'
import type { AIDivergenceDirection } from '@/types/ai'
import { CreateOutline, TrashOutline } from '@vicons/ionicons5'
import DraggableSortList from '@/components/common/DraggableSortList.vue'
import { useThemeStore } from '@/stores/theme'
import { useLayoutStore } from '@/stores/layout'
import { useAIDirectionsStore } from '@/stores/aiDirections'
import { accentSchemes, type AccentSchemeId } from '@/config/colorSchemes'
import { t } from '@/composables/useT'
import { computed, ref } from 'vue'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const theme = useThemeStore()
const layout = useLayoutStore()
const dialog = useDialog()
const aiDirections = useAIDirectionsStore()

/** 当前明暗模式下各主色调的色块颜色 */
const dotColors = computed(() => {
  const mode = theme.isDark ? 'dark' : 'light'
  return {
    emerald: accentSchemes.emerald.variants[mode].cssVars['--color-primary'],
    blue: accentSchemes.blue.variants[mode].cssVars['--color-primary'],
  }
})

/** 恢复默认布局：先弹确认框，确认后调用 layout.resetDock() */
function handleResetLayout(): void {
  dialog.warning({
    title: t('settings.resetLayout'),
    content: t('settings.resetLayoutConfirm'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => layout.resetDock(),
  })
}

// ── 发散方向管理 ──

/** 方向下拉选项：label=title，value=id */
const directionOptions = computed(() =>
  aiDirections.directionList.map((d) => ({ label: d.title, value: d.id })),
)

/** 当前默认方向 id（用于行内「默认」徽标判断） */
const defaultId = computed(() => aiDirections.defaultDirectionId)

/** 新增/编辑弹窗标题 */
const editableTitle = computed(() =>
  editId.value != null ? t('settings.directionEdit') : t('settings.directionAdd'),
)

/** 删除方向 */
function handleDeleteDirection(id: string): void {
  aiDirections.deleteDirection(id)
}

/** 切换默认方向 */
function onDefaultChange(value: string): void {
  if (value) aiDirections.setDefaultDirection(value)
}

// 新增 / 编辑弹窗
const showEditable = ref(false)
const editId = ref<string | null>(null)
const formRef = ref<FormInst | null>(null)
const form = ref({ title: '', prompt: '', separator: ' ' })

/** 表单校验规则：标题与提示词必填 */
const formRules: FormRules = {
  title: {
    required: true,
    message: t('settings.directionTitleRequired'),
    trigger: ['blur', 'input'],
  },
  prompt: {
    required: true,
    message: t('settings.directionPromptRequired'),
    trigger: ['blur', 'input'],
  },
}

/** 打开「新增」弹窗：清空表单 */
function openAdd(): void {
  editId.value = null
  form.value = { title: '', prompt: '', separator: ' ' }
  showEditable.value = true
}

/** 打开「编辑」弹窗：以已有方向回填表单 */
function openEdit(id: string): void {
  const d = aiDirections.directionList.find((x) => x.id === id)
  if (!d) return
  editId.value = id
  form.value = { title: d.title, prompt: d.prompt, separator: d.separator ?? ' ' }
  showEditable.value = true
}

/** 保存（新增或编辑） */
async function handleSave(): Promise<void> {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  const { title, prompt } = form.value
  // 分隔符为空时回退默认空格
  const separator = form.value.separator.trim() || ' '
  if (editId.value != null) {
    aiDirections.updateDirection(editId.value, { title, prompt, separator })
  } else {
    aiDirections.addDirection(title, prompt, separator)
  }
  showEditable.value = false
}

/** 拖拽排序转发给 store */
function handleReorderDirections(fromIndex: number, toIndex: number): void {
  aiDirections.reorderDirection(fromIndex, toIndex)
}

/** 恢复默认方向：先弹确认框，确认后调用 resetToDefaults() 清空用户配置 */
function handleResetDirections(): void {
  dialog.warning({
    title: t('settings.resetDirections'),
    content: t('settings.resetDirectionsConfirm'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => aiDirections.resetToDefaults(),
  })
}
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="true"
    @update:show="(v: boolean) => { if (!v) emit('close') }"
  >
    <NCard :title="t('settings.title')" style="width: 480px" closable @close="emit('close')">
      <NSpace vertical size="medium">
        <div>
          <NText strong>{{ t('settings.appearance') }}</NText>
          <NDivider style="margin: 8px 0" />
          <NSpace justify="space-between" align="center" style="width: 100%">
            <NText>{{ t('settings.darkMode') }}</NText>
            <NSwitch :value="theme.isDark" @update:value="() => theme.toggle()" />
          </NSpace>
          <NSpace justify="space-between" align="center" style="width: 100%; margin-top: 10px">
            <NText>{{ t('settings.accent') }}</NText>
            <NRadioGroup
              :value="theme.accentId"
              @update:value="(v: AccentSchemeId) => theme.setAccent(v)"
            >
              <NRadioButton value="emerald">
                <span class="accent-option">
                  <span class="accent-dot" :style="{ background: dotColors.emerald }" />
                  {{ t('settings.accentEmerald') }}
                </span>
              </NRadioButton>
              <NRadioButton value="blue">
                <span class="accent-option">
                  <span class="accent-dot" :style="{ background: dotColors.blue }" />
                  {{ t('settings.accentBlue') }}
                </span>
              </NRadioButton>
            </NRadioGroup>
          </NSpace>
        </div>
        <div>
          <NText strong>{{ t('settings.layout') }}</NText>
          <NDivider style="margin: 8px 0" />
          <NButton @click="handleResetLayout">{{ t('settings.resetLayout') }}</NButton>
        </div>
        <div>
          <NText strong>{{ t('settings.canvas') }}</NText>
          <NDivider style="margin: 8px 0" />
          <NSpace justify="space-between" align="center" style="width: 100%">
            <NText>{{ t('settings.showGrid') }}</NText>
            <NSwitch :value="false" />
          </NSpace>
          <NSpace justify="space-between" align="center" style="width: 100%; margin-top: 8px">
            <NText>{{ t('settings.snapToGrid') }}</NText>
            <NSwitch :value="false" />
          </NSpace>
        </div>
        <div>
          <NText strong>{{ t('settings.shortcuts') }}</NText>
          <NDivider style="margin: 8px 0" />
          <NText depth="3">{{ t('settings.customShortcutsSoon') }}</NText>
        </div>
        <div>
          <NText strong>{{ t('settings.aiDirections') }}</NText>
          <NDivider style="margin: 8px 0" />

          <NText depth="2">{{ t('settings.aiDirectionDefault') }}</NText>
          <NSelect
            :value="aiDirections.defaultDirectionId"
            :options="directionOptions"
            size="small"
            style="width: 100%; margin-top: 6px"
            @update:value="(v: string) => onDefaultChange(v)"
          />
          <NText depth="3" class="settings-hint">{{ t('settings.aiDirectionDefaultHint') }}</NText>

          <div class="directions-head">
            <NButton size="tiny" type="primary" dashed @click="openAdd">
              {{ t('settings.directionAdd') }}
            </NButton>
          </div>

          <NScrollbar class="directions-scroll">
            <DraggableSortList
              :items="aiDirections.directionList"
              :show-shortcut-badge="false"
              @reorder="handleReorderDirections"
            >
              <template #default="{ item: d }">
                <NTag v-if="d.id === defaultId" size="tiny" type="primary" class="default-badge">
                  {{ t('settings.defaultBadge') }}
                </NTag>
                <NText class="direction-title" depth="2">{{ d.title }}</NText>
                <NButton
                  size="tiny"
                  quaternary
                  class="action-btn"
                  :title="t('settings.directionEdit')"
                  @click="openEdit(d.id)"
                >
                  <NIcon><CreateOutline /></NIcon>
                </NButton>
                <NPopconfirm
                  :positive-text="t('common.confirm')"
                  :negative-text="t('common.cancel')"
                  @positive-click="handleDeleteDirection(d.id)"
                >
                  <template #trigger>
                    <NButton
                      size="tiny"
                      quaternary
                      class="action-btn"
                      :title="t('settings.directionDelete')"
                    >
                      <NIcon><TrashOutline /></NIcon>
                    </NButton>
                  </template>
                  {{ t('settings.directionDeleteConfirm', { name: d.title }) }}
                </NPopconfirm>
              </template>

              <template #empty>
                <div class="directions-empty">
                  <NEmpty :description="t('settings.aiDirectionsEmpty')" size="small" />
                </div>
              </template>
            </DraggableSortList>
          </NScrollbar>

          <div class="reset-row">
            <NButton quaternary size="tiny" @click="handleResetDirections">
              {{ t('settings.resetDirections') }}
            </NButton>
          </div>
        </div>
      </NSpace>
    </NCard>
  </NModal>

  <!-- 新增 / 编辑发散方向弹窗 -->
  <NModal v-model:show="showEditable" preset="card" :title="editableTitle" style="width: 440px">
    <NForm ref="formRef" :model="form" :rules="formRules" label-placement="top" :show-feedback="true">
      <NFormItem :label="t('settings.directionTitle')" path="title">
        <NInput
          v-model:value="form.title"
          size="small"
          :placeholder="t('settings.directionTitlePlaceholder')"
        />
      </NFormItem>
      <NFormItem :label="t('settings.directionPrompt')" path="prompt">
        <NInput
          v-model:value="form.prompt"
          type="textarea"
          size="small"
          :rows="3"
          :placeholder="t('settings.directionPromptPlaceholder')"
        />
      </NFormItem>
      <NFormItem :label="t('settings.directionSeparator')" path="separator">
        <NSpace vertical size="small" style="width: 100%">
          <NInput
            v-model:value="form.separator"
            size="small"
            :placeholder="t('settings.directionSeparatorPlaceholder')"
          />
          <NText depth="3" class="settings-hint">{{ t('settings.directionSeparatorHint') }}</NText>
        </NSpace>
      </NFormItem>
    </NForm>
    <div class="modal-footer">
      <NButton size="small" @click="showEditable = false">{{ t('common.cancel') }}</NButton>
      <NButton size="small" type="primary" @click="handleSave">{{ t('common.confirm') }}</NButton>
    </div>
  </NModal>
</template>

<style scoped>
.accent-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.accent-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── 发散方向分区 ── */

/* 分区内辅助说明（辅助→弱提示层级） */
.settings-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
}

/* 列表区头部：新增按钮行 */
.directions-head {
  margin-top: 12px;
  display: flex;
  align-items: center;
}

/* 方向列表：限高 + 滚动，避免拉高整个设置弹窗 */
.directions-scroll {
  max-height: 196px;
  margin-top: 4px;
  border-top: 1px solid var(--color-border);
}

/* 行内「默认」徽标 */
.default-badge {
  flex-shrink: 0;
}

/* 行内标题：占据剩余宽度，超长省略 */
.direction-title {
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

.directions-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 32px 0;
}

/* 底部「恢复默认」行 */
.reset-row {
  margin-top: 8px;
  display: flex;
  justify-content: flex-start;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
}
</style>
