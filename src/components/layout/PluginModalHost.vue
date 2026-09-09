<script setup lang="ts">
/**
 * PluginModalHost — 插件模态宿主（应用级单实例，与 SettingsModal 同级挂载于 AppShell）
 *
 * 从 uiRegistry 登记总表的 modals 表读插件模态条目，按 modalStore.activeKey 渲染当前
 * 打开的插件模态（内置模态如 settings 由各自组件承载，不经本宿主）：
 * - activeKey 为 null 或对应条目不存在 → 不渲染任何内容（v-if 卸载整棵子树）
 * - 渲染结构：ModalShell 外壳（标题栏 / 遮罩 / Esc / 宽度）+ PluginErrorBoundary
 *   （渲染错误隔离到占位，与 DockPanel / SettingsModal 对插件条目的处理一致）
 * - 本宿主无任何清理逻辑（无需孤儿兜底）：未登记 key 在插件入口
 *   createPluginModalApi.open 即被拒绝（warn + false，见 plugin/ui.ts）；
 *   运行期注册表不变——启停仅持久化、重启应用生效，removePlugin 运行期唯一触发为
 *   启动期 installAll 内 setup 抛错的 rollbackPluginUi（此时 activeKey 恒为 null，
 *   时序上不可能有模态打开）；且启停开关在设置面板内，模态独占下无法同时发生。
 *
 * 关闭一律上抛 modalStore.close()，开关状态由 modal store 单一数据源驱动。
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
