<script setup lang="ts">
/**
 * PluginFloatingHost — 插件浮动层宿主（多实例，与 PluginModalHost 同级挂载于 AppShell）
 *
 * 两个 host 同层面、职责对称（插件注册都只填内容）：
 * ┌──────────────────┬─────────────────────────────┬─────────────────────────────┐
 * │                  │ PluginModalHost（模态）      │ PluginFloatingHost（浮动层） │
 * ├──────────────────┼─────────────────────────────┼─────────────────────────────┤
 * │ 实例数           │ 单实例（modal store 裁决）   │ 可存在多个（逐条目渲染）     │
 * │ 位置             │ 固定（ModalShell 居中）      │ 可随意拖动（FloatingWindow 壳）│
 * │ 关闭方           │ 主应用（ModalShell × / Esc） │ 只由对应插件负责（运行时 API）│
 * │ 显隐状态         │ modalStore.activeKey         │ pluginFloating store（逐 key）│
 * └──────────────────┴─────────────────────────────┴─────────────────────────────┘
 *
 * 渲染结构：uiRegistry 的 floatingLayers 表逐条目 → common/FloatingWindow（通用窗口壳：
 * 定位 / 拖动 / 把手条标题 / 转场全部内化在窗口组件；宿主负责把 pluginFloating store 的
 * isVisible(entry.key) 映射为 show prop（reactive Map 深响应式，模板内调用即保持联动）——
 * 默认隐藏，open 才可见）→ slot 内 PluginErrorBoundary 包裹插件内容组件——错误边界
 * 职责仍留 host，与 PluginModalHost 一致。
 * 插件控显隐：经 ctx.floating / adapter.for(id).floating（open/close/toggle/isVisible，
 * 收插件内短 id，fail-fast 查登记表，见 plugin/ui.ts 的 createPluginFloatingApi）。
 * 无清理逻辑：条目删除（removePlugin / rollbackPluginUi）后响应式 Map 变化自动卸载子树。
 */
import { computed } from 'vue'
import FloatingWindow from '@/components/common/FloatingWindow.vue'
import PluginErrorBoundary from '@/components/plugin/PluginErrorBoundary.vue'
import { usePluginFloatingStore } from '@/stores/pluginFloating'
import { useUiRegistryStore, type UiFloatingLayerEntry } from '@/stores/uiRegistry'

const registry = useUiRegistryStore()
const pluginFloating = usePluginFloatingStore()

/** 全部已登记插件浮动层条目（登记序；注册 / removePlugin 的表变动响应式驱动重渲染） */
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
