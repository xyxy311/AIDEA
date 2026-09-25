<script setup lang="ts">
/**
 * PluginFloatingHost — 插件浮动层宿主（多实例，挂载于 AppShell）：按 uiRegistry 的
 * floatingLayers 表逐条目渲染 FloatingWindow 外壳 + PluginErrorBoundary，显隐由
 * pluginFloating store 驱动（默认隐藏，open 才可见）；条目删除后响应式 Maps 自动卸载。
 */
import { computed } from 'vue'
import FloatingWindow from '@/components/common/FloatingWindow.vue'
import PluginErrorBoundary from '@/components/plugin/PluginErrorBoundary.vue'
import { usePluginFloatingStore } from '@/stores/pluginFloating'
import { useUiRegistryStore, type UiFloatingLayerEntry } from '@/stores/uiRegistry'

const registry = useUiRegistryStore()
const pluginFloating = usePluginFloatingStore()

/** 已登记插件浮动层条目（登记序，表变动响应式驱动重渲染） */
const entries = computed<UiFloatingLayerEntry[]>(() => Array.from(registry.floatingLayers.values()))
</script>

<template>
  <!-- 逐条目渲染通用窗口壳；显隐由 pluginFloating store 映射为 show（默认隐藏，open 才可见） -->
  <FloatingWindow
    v-for="entry in entries"
    :key="entry.key"
    :show="pluginFloating.isVisible(entry.key)"
    :title="entry.title"
  >
    <!-- 插件内容外包错误边界，渲染异常隔离到占位，不拖垮整体（与 PluginModalHost 一致） -->
    <PluginErrorBoundary :plugin-id="entry.pluginId" :name="entry.key">
      <component :is="entry.component" />
    </PluginErrorBoundary>
  </FloatingWindow>
</template>
