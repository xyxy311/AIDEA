<script setup lang="ts">
/**
 * NodePropertyEditor — 节点属性编辑面板
 *
 * 当选中节点时，可修改节点的文本内容和外观样式。
 */
import { computed } from 'vue'
import {
  NInput,
  NColorPicker,
  NForm,
  NFormItem,
  NText,
  NDivider,
  NButton,
} from 'naive-ui'
import { useActiveWhiteboard } from '@/composables/useActiveWhiteboard'
import { usePresetsStore } from '@/stores/presets'
import { DEFAULT_NODE_STYLE } from '@/constants'

const active = useActiveWhiteboard()

const node = computed(() => active.board.selectedNode)

const currentText = computed({
  get: () => node.value?.text ?? '',
  set: (val: string) => {
    if (node.value) active.board.updateNodeText(node.value.id, val)
  },
})

const currentTextColor = computed({
  get: () => node.value?.textColor ?? DEFAULT_NODE_STYLE.textColor,
  set: (val: string | null) => {
    if (node.value && val) active.board.setNodeTextColor(node.value.id, val)
  },
})

const currentBgColor = computed({
  get: () => node.value?.backgroundColor ?? DEFAULT_NODE_STYLE.backgroundColor,
  set: (val: string | null) => {
    if (node.value && val) active.board.setNodeBackgroundColor(node.value.id, val)
  },
})

const currentBorderColor = computed({
  get: () => node.value?.borderColor ?? DEFAULT_NODE_STYLE.borderColor,
  set: (val: string | null) => {
    if (node.value && val) active.board.setNodeBorderColor(node.value.id, val)
  },
})

const colorPickerMode = 'hex' as const

const presetsStore = usePresetsStore()

function handleSaveAsPreset(): void {
  if (!node.value) return
  presetsStore.addNodePreset({
    name: node.value.text || '自定义预设',
    backgroundColor: node.value.backgroundColor ?? DEFAULT_NODE_STYLE.backgroundColor,
    borderColor: node.value.borderColor ?? DEFAULT_NODE_STYLE.borderColor,
    textColor: node.value.textColor ?? DEFAULT_NODE_STYLE.textColor,
  })
}
</script>

<template>
  <div class="property-editor" v-if="node">
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

    <NDivider style="margin: 8px 0" />
    <NButton
      size="small"
      quaternary
      block
      @click="handleSaveAsPreset"
    >
      保存为节点预设
    </NButton>
  </div>

  <div v-else class="property-empty">
    <NText depth="3" style="font-size: 13px">选中一个节点以编辑属性</NText>
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
</style>
