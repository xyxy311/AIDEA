<script setup lang="ts">
/**
 * WhiteboardCanvas - 主视图画布入口（薄壳）
 *
 * 主视图 viewId 固定为 'main'。键盘快捷键全局单份，在此挂载，作用于主视图。
 * 内联视图使用 CanvasStage 直接渲染，不经过此组件。
 */
import { computed } from 'vue'
import { useViewStore } from '@/stores/view'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import CanvasStage from './CanvasStage.vue'

const view = useViewStore('main')
const isEditing = computed(() => view.editingNodeId !== null)
useKeyboardShortcuts(isEditing)
</script>

<template>
  <CanvasStage view-id="main" :allow-expand="true" :show-overview-map="true" />
</template>
