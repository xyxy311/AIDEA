<script setup lang="ts">
/**
 * FloatingPresetEditor — 浮动编辑器添加/编辑预设的紧凑弹层
 *
 * 节点预设：名称 + 颜色
 * 连线预设：名称 + 颜色 + 线型 + 粗细 + 有向箭头
 * 增改统一调 presetsStore（与右侧边栏共用同一数据源）。
 */
import { ref, computed, watch } from 'vue'
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NColorPicker,
  NSelect,
  NInputNumber,
  NCheckbox,
  NButton,
} from 'naive-ui'
import type { NodePresetStyle, ConnectionPresetStyle, LineStyle } from '@/types'
import { usePresetsStore } from '@/stores/presets'
import { t } from '@/composables/useT'
import { LINE_STYLE_OPTIONS, CONNECTION_MAX_STROKE_WIDTH } from '@/constants'

const props = defineProps<{
  show: boolean
  type: 'node' | 'connection'
  /** 待编辑预设；null = 新建 */
  editing: NodePresetStyle | ConnectionPresetStyle | null
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const presetsStore = usePresetsStore()

const formName = ref('')
const formBorderColor = ref('#d1d5db')
const formLineStyle = ref<LineStyle>('solid')
const formStrokeWidth = ref(2)
const formStrokeColor = ref('#6b7280')
const formDirected = ref(true)

watch(
  () => props.show,
  (show) => {
    if (!show) return
    formName.value = ''
    formBorderColor.value = '#d1d5db'
    formLineStyle.value = 'solid'
    formStrokeWidth.value = 2
    formStrokeColor.value = '#6b7280'
    formDirected.value = true
    if (props.editing) {
      formName.value = props.editing.name
      if (props.type === 'node') {
        formBorderColor.value = (props.editing as NodePresetStyle).borderColor
      } else {
        const e = props.editing as ConnectionPresetStyle
        formLineStyle.value = e.lineStyle
        formStrokeWidth.value = e.strokeWidth
        formStrokeColor.value = e.strokeColor
        formDirected.value = e.directed
      }
    }
  },
)

const title = computed(() => {
  if (props.type === 'node') {
    return props.editing ? t('floatingEditor.editNodePreset') : t('floatingEditor.newNodePreset')
  }
  return props.editing ? t('floatingEditor.editConnPreset') : t('floatingEditor.newConnPreset')
})

function handleSave(): void {
  const name = formName.value.trim()
  if (!name) return
  const id = (props.editing as { id?: string } | null)?.id
  if (props.type === 'node') {
    if (id) {
      presetsStore.updateNodePreset(id, { name, borderColor: formBorderColor.value })
    } else {
      presetsStore.addNodePreset({ name, borderColor: formBorderColor.value, groupId: presetsStore.currentNodeGroupId })
    }
  } else {
    const payload = {
      name,
      lineStyle: formLineStyle.value,
      strokeWidth: formStrokeWidth.value,
      strokeColor: formStrokeColor.value,
      directed: formDirected.value,
      groupId: presetsStore.currentConnectionGroupId,
    }
    if (id) {
      presetsStore.updateConnectionPreset(id, payload)
    } else {
      presetsStore.addConnectionPreset(payload)
    }
  }
  emit('saved')
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="title"
    style="width: 300px"
    @update:show="(v: boolean) => { if (!v) emit('close') }"
  >
    <NForm label-placement="top" :show-feedback="false" size="small">
      <NFormItem :label="t('floatingEditor.name')">
        <NInput
          v-model:value="formName"
          :placeholder="t('floatingEditor.presetNamePlaceholder')"
        />
      </NFormItem>

      <!-- 节点预设：仅颜色 -->
      <template v-if="type === 'node'">
        <NFormItem :label="t('floatingEditor.presetBorderColor')">
          <NColorPicker v-model:value="formBorderColor" :show-alpha="true" />
        </NFormItem>
      </template>

      <!-- 连线预设：颜色 + 线型 + 粗细 + 箭头 -->
      <template v-else>
        <NFormItem :label="t('floatingEditor.color')">
          <NColorPicker v-model:value="formStrokeColor" :show-alpha="false" />
        </NFormItem>
        <NFormItem :label="t('floatingEditor.lineStyle')">
          <NSelect v-model:value="formLineStyle" :options="LINE_STYLE_OPTIONS" />
        </NFormItem>
        <NFormItem :label="t('floatingEditor.width')">
          <NInputNumber
            v-model:value="formStrokeWidth"
            :min="1"
            :max="CONNECTION_MAX_STROKE_WIDTH"
            show-button
          />
        </NFormItem>
        <NFormItem>
          <NCheckbox v-model:checked="formDirected">{{ t('floatingEditor.directed') }}</NCheckbox>
        </NFormItem>
      </template>
    </NForm>

    <template #footer>
      <div class="floating-preset__footer">
        <NButton size="small" @click="emit('close')">{{ t('floatingEditor.cancel') }}</NButton>
        <NButton size="small" type="primary" @click="handleSave">
          {{ t('floatingEditor.save') }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.floating-preset__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>