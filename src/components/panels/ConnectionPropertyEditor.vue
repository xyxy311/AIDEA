<script setup lang="ts">
/**
 * ConnectionPropertyEditor — 连线属性编辑面板
 *
 * 当选中连线时，可修改该连线的线型、粗细、颜色和箭头开关。
 */
import { computed } from 'vue'
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
} from 'naive-ui'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import {
  LINE_STYLE_OPTIONS,
  CONNECTION_MAX_STROKE_WIDTH,
} from '@/constants'
import type { LineStyle } from '@/types'

const active = useActiveWhiteboard()

const conn = computed(() => active.board.selectedConnection)

/** 获取连线的两端节点名称 */
function getNodeLabel(nodeId: string): string {
  const node = active.board.nodesArray.find((n) => n.id === nodeId)
  return node ? (node.text || '未命名节点') : nodeId
}

const lineStyle = computed<LineStyle | undefined>({
  get: () => conn.value?.lineStyle,
  set: (val) => {
    if (conn.value && val) {
      active.board.updateConnection(conn.value.id, { lineStyle: val })
    }
  },
})

const strokeWidth = computed<number | undefined>({
  get: () => conn.value?.strokeWidth,
  set: (val) => {
    if (conn.value && val !== undefined) {
      active.board.updateConnection(conn.value.id, { strokeWidth: val })
    }
  },
})

const strokeColor = computed<string | undefined>({
  get: () => conn.value?.strokeColor,
  set: (val) => {
    if (conn.value && val) {
      active.board.updateConnection(conn.value.id, { strokeColor: val })
    }
  },
})

const directed = computed<boolean | undefined>({
  get: () => conn.value?.directed,
  set: (val) => {
    if (conn.value && val !== undefined) {
      active.board.updateConnection(conn.value.id, { directed: val })
    }
  },
})

const colorPickerMode = 'hex' as const
</script>

<template>
  <div class="property-editor" v-if="conn">
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
      <NText depth="3" style="font-size: 12px; font-weight: 600">连线样式</NText>

      <NFormItem label="线型" style="margin-top: 8px">
        <NSelect
          v-model:value="lineStyle"
          :options="LINE_STYLE_OPTIONS"
          size="small"
          placeholder="选择线型"
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

      <NFormItem label="箭头">
        <NSwitch
          v-model:value="directed"
          size="small"
        />
      </NFormItem>
    </NForm>
  </div>

  <div v-else class="property-empty">
    <NText depth="3" style="font-size: 13px">选中一条连线以编辑属性</NText>
  </div>
</template>

<style scoped>
.property-editor {
  padding: 8px 0;
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
</style>
