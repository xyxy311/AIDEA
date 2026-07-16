<script setup lang="ts">
/**
 * SettingsModal — 设置面板
 *
 * 窗口式外观，不可拖拽移动，仅 UI 占位。
 */
import { NModal, NCard, NDivider, NSwitch, NSpace, NText } from 'naive-ui'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="true"
    @update:show="(v: boolean) => { if (!v) emit('close') }"
  >
    <NCard title="设置" style="width: 480px" closable @close="emit('close')">
      <NSpace vertical size="medium">
        <div>
          <NText strong>外观</NText>
          <NDivider style="margin: 8px 0" />
          <NSpace justify="space-between" align="center" style="width: 100%">
            <NText>深色模式</NText>
            <NSwitch :value="false" />
          </NSpace>
        </div>
        <div>
          <NText strong>画布</NText>
          <NDivider style="margin: 8px 0" />
          <NSpace justify="space-between" align="center" style="width: 100%">
            <NText>显示网格</NText>
            <NSwitch :value="false" />
          </NSpace>
          <NSpace justify="space-between" align="center" style="width: 100%; margin-top: 8px">
            <NText>吸附到网格</NText>
            <NSwitch :value="false" />
          </NSpace>
        </div>
        <div>
          <NText strong>快捷键</NText>
          <NDivider style="margin: 8px 0" />
          <NText depth="3">自定义快捷键（即将推出）</NText>
        </div>
      </NSpace>
    </NCard>
  </NModal>
</template>
