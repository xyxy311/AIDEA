<script setup lang="ts">
/**
 * PropertyPanel - 属性编辑器面板（property）
 *
 * 作为右侧 dock 的一个普通面板，根据当前选中对象自动切换：
 * - 选中连线 → ConnectionPropertyEditor
 * - 否则（选中节点 / 无选中）→ NodePropertyEditor
 *
 * 无自带 header，标题由外层 DockPanel 提供。
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