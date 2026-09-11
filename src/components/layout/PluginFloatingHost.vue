<script setup lang="ts">
/**
 * PluginFloatingHost — 插件浮动层宿主（应用级单实例，与 PluginModalHost 同级挂载于 AppShell）
 *
 * 从 uiRegistry 登记总表的 floatingLayers 表读插件浮动层条目，逐条常驻渲染：
 * - 显隐由插件组件自管（如 AI 生成词浮动面板：组件内部状态控制自身可见性），
 *   宿主不做任何 open/close 裁决（与模态经 modalStore.activeKey 单实例渲染不同，
 *   浮动层无全局开关，登记即可见）；
 * - 每个条目外包 PluginErrorBoundary，渲染错误隔离到占位，不拖垮整体
 *   （与 PluginModalHost / DockPanel 对插件条目的处理一致）；
 * - 无任何清理逻辑：条目生命周期完全跟随登记表（removePlugin / rollbackPluginUi
 *   删条目后，响应式 Map 变化自动卸载对应子树）。
 *
 * 常驻应用根级，由 AppShell 挂载（挂载由后续 lane 完成，本组件不自行挂载）。
 */
import { computed } from 'vue'
import PluginErrorBoundary from '@/components/plugin/PluginErrorBoundary.vue'
import { useUiRegistryStore, type UiFloatingLayerEntry } from '@/stores/uiRegistry'

const registry = useUiRegistryStore()

/** 全部已登记插件浮动层条目（登记序；注册 / removePlugin 的表变动响应式驱动重渲染） */
const entries = computed<UiFloatingLayerEntry[]>(() => Array.from(registry.floatingLayers.values()))
</script>

<template>
  <!-- 插件浮动层逐条常驻渲染；显隐由组件自管，宿主不做任何开关裁决 -->
  <template v-for="entry in entries" :key="entry.key">
    <PluginErrorBoundary :plugin-id="entry.pluginId" :name="entry.key">
      <component :is="entry.component" />
    </PluginErrorBoundary>
  </template>
</template>
