<script setup lang="ts">
/**
 * ConnectionPropertyEditor - 连线属性编辑面板：修改选中连线的线型、粗细、颜色和箭头开关。
 * 预设管理已移至左侧「预设管理」面板与浮动编辑器，此处不再展示。
 */
import { ref, computed } from 'vue'
import type { LineStyle } from '@/types'
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
  NInput,
} from 'naive-ui'
import { useActiveView } from '@/composables/useActiveView'
import { t } from '@/composables/useT'
import {
  LINE_STYLE_OPTIONS,
  CONNECTION_MAX_STROKE_WIDTH,
} from '@/constants'

const active = useActiveView()

// 选中的连线信息
// 跨视图选中：连线可能来自主视图或任一内联视图宿主节点，按 ID 全局查找
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

/** 线型下拉选项：label 经 t() 实时翻译（computed 内，语言切换热更新） */
const lineStyleOptions = computed(() =>
  LINE_STYLE_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) })),
)

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
          :options="lineStyleOptions"
          size="small"
          :placeholder="t('connectionEditor.lineStylePlaceholder')"
        />
      </NFormItem>

      <NFormItem :label="t('connectionEditor.width')">
        <NSlider
          v-model:value="strokeWidth"
          :min="1"
          :max="CONNECTION_MAX_STROKE_WIDTH"
          :step="1"
          :format-tooltip="(v: number) => `${v}px`"
        />
      </NFormItem>

      <NFormItem :label="t('connectionEditor.color')">
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
  </div>

  <div v-else class="property-empty">
    <NText depth="3" style="font-size: 13px">{{ t('connectionEditor.selectConnectionHint') }}</NText>
  </div>
</template>

<style scoped>
.property-editor {
  padding: 8px 12px;
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
</style>