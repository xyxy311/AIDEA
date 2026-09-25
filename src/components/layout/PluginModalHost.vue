<script setup lang="ts">
/**
 * PluginModalHost — 插件模态宿主（应用级单实例，挂载于 AppShell）：按 modalStore.activeKey
 * 从 uiRegistry 的 modals 表读取并渲染当前打开的插件模态（内置模态由各自组件承载），
 * 结构为 ModalShell 外壳 + PluginErrorBoundary；关闭一律上抛 modalStore.close()。
 */
import { computed } from 'vue'
import ModalShell from '@/components/common/ModalShell.vue'
import PluginErrorBoundary from '@/components/plugin/PluginErrorBoundary.vue'
import { useUiRegistryStore, type UiModalEntry } from '@/stores/uiRegistry'
import { useModalStore } from '@/stores/modal'

const registry = useUiRegistryStore()
const modalStore = useModalStore()

/** 当前打开的插件模态条目；activeKey 为 null / 未登记 → undefined（不渲染） */
const activeEntry = computed<UiModalEntry | undefined>(() => {
  const key = modalStore.activeKey
  return key !== null ? registry.modals.get(key) : undefined
})
</script>

<template>
  <!-- v-if：无打开的插件模态（或 key 未登记）时不渲染任何 DOM -->
  <ModalShell
    v-if="activeEntry"
    :show="true"
    :title="activeEntry.def.title"
    :width="activeEntry.def.width"
    @close="modalStore.close()"
  >
    <!-- 插件内容外包错误边界，渲染异常隔离到占位，不拖垮整体 -->
    <PluginErrorBoundary :plugin-id="activeEntry.pluginId" :name="activeEntry.def.title">
      <component :is="activeEntry.def.component" />
    </PluginErrorBoundary>
  </ModalShell>
</template>
