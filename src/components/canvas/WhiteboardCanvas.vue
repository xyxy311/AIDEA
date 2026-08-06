<script setup lang="ts">
/**
 * WhiteboardCanvas - 主视图画布入口（薄壳）
 *
 * 主视图 viewId 固定为 'main'。
 * 键盘快捷键全局单份，在 AppShell 挂载（作用主视图与文件操作）。
 * 内联视图使用 CanvasStage 直接渲染，不经过此组件。
 */
import CanvasStage from './CanvasStage.vue'
</script>

<template>
  <CanvasStage view-id="main" :allow-expand="true" :show-overview-map="true" />
</template>
