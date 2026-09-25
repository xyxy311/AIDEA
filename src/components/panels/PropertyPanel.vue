<script setup lang="ts">
/**
 * PropertyPanel - 属性编辑器面板：按当前选中对象自动切换
 * 连线 → ConnectionPropertyEditor，否则 → NodePropertyEditor。无自带 header。
 */
import { computed } from 'vue'
import { useActiveView } from '@/composables/useActiveView'
import NodePropertyEditor from './NodePropertyEditor.vue'
import ConnectionPropertyEditor from './ConnectionPropertyEditor.vue'

const active = useActiveView()

/** 是否选中连线（决定切换哪个编辑器） */
const isConnectionSelected = computed(
  () => active.view.selectedConnectionIds.size > 0,
)
</script>

<template>
  <ConnectionPropertyEditor v-if="isConnectionSelected" />
  <NodePropertyEditor v-else />
</template>