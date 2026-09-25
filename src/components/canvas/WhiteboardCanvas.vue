<script setup lang="ts">
/**
 * WhiteboardCanvas - 主视图画布入口（viewId 固定 'main'，内联视图直接经 CanvasStage 渲染）。
 */
import CanvasStage from './CanvasStage.vue'
</script>

<template>
  <CanvasStage view-id="main" :allow-expand="true" :show-overview-map="true" />
</template>
