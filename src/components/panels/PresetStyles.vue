<script setup lang="ts">
/**
 * PresetStyles — 预设样式面板
 *
 * 展示一组预定义节点样式，点击即可应用到当前选中节点。
 */
import { NText, NButton, NDivider } from 'naive-ui'
import { PRESET_STYLES, type PresetStyle } from '@/constants'
import { useWhiteboardStore } from '@/stores/whiteboard'

const store = useWhiteboardStore()

function applyStyle(preset: PresetStyle): void {
  if (!store.selectedNodeId) return
  store.applyPresetStyle(store.selectedNodeId, preset)
}
</script>

<template>
  <div class="preset-styles">
    <NDivider style="margin: 8px 0" />
    <NText depth="3" style="font-size: 12px; font-weight: 600">预设样式</NText>
    <div class="preset-grid">
      <button
        v-for="preset in PRESET_STYLES"
        :key="preset.name"
        class="preset-chip"
        :style="{
          backgroundColor: preset.backgroundColor,
          borderColor: preset.borderColor,
          color: preset.textColor,
        }"
        :disabled="!store.selectedNodeId"
        @click="applyStyle(preset)"
      >
        {{ preset.name }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.preset-styles {
  padding: 0 0 8px;
}

.preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 8px;
}

.preset-chip {
  padding: 6px 8px;
  border: 2px solid;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
  text-align: center;
}

.preset-chip:hover:not(:disabled) {
  transform: scale(1.03);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.preset-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
