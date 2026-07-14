<script setup lang="ts">
/**
 * App - 应用根组件
 *
 * 挂载 AppShell 布局，在此处注入全局样式。
 * 所有功能逻辑下放至子组件，App.vue 仅负责顶级组合。
 */
import AppShell from '@/components/layout/AppShell.vue'
</script>

<template>
  <AppShell />
</template>
