<script setup lang="ts">
/**
 * App - 应用根组件
 *
 * 挂载 AppShell 布局，在此处注入全局样式。
 * 所有功能逻辑下放至子组件，App.vue 仅负责顶级组合。
 */
import { NConfigProvider, NGlobalStyle, NMessageProvider } from 'naive-ui'
import AppShell from '@/components/layout/AppShell.vue'
import { useThemeStore } from '@/stores/theme'

const theme = useThemeStore()
</script>

<template>
  <NConfigProvider :theme="theme.scheme.theme" :theme-overrides="theme.scheme.naiveOverrides">
    <NMessageProvider>
      <NGlobalStyle />
      <AppShell />
    </NMessageProvider>
  </NConfigProvider>
</template>
