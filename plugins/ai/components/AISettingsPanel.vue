<script setup lang="ts">
/**
 * AISettingsPanel — 插件「AI 设置」栏目内容组件（无自带 header，栏目标题由设置弹窗渲染）
 *
 * 栏目壳：把本插件全部配置收敛为一个设置栏目、内部分三个分区自上而下排列
 * （SDK 硬约束「一个插件至多一个设置栏目」，见 uiRegistry.registerPluginSettingsCategory）：
 * ① AI 连接（AIConnectionSettings 子组件：分区标题 + 恢复默认 + 连接参数五行）；
 * ② 快捷键（ShortcutActionRow 渲染本插件登记动作，改键行独占在插件自身设置栏目）；
 * ③ 发散方向（AIDirectionsSection 子组件：分区标题 + 默认方向 + 方向 CRUD）。
 * 不做成巨石单文件：连接 / 方向两个既有 Section 保留为子组件原样复用，分区标题行
 * 归各自子组件持有，本组件只补分区②与分区间隔样式。
 * 布局沿用内置 Settings Section 的 .settings-controls/.setting-row 结构
 * （SDK 共享样式 settings-shared.css 经 adapter 统一注入，与内置分区序列视觉一致）。
 */
import { computed } from 'vue'
import { adapter, ShortcutActionRow } from '@/plugin/adapter'
import AIConnectionSettings from './AIConnectionSettings.vue'
import AIDirectionsSection from './AIDirectionsSection.vue'
import { AI_PLUGIN_ID } from '../constants'
import { t } from '../i18n'

/** 本插件登记的快捷键动作（key=完整登记 key，label=成品文案）；computed 保持 uiRegistry 联动 */
const pluginActions = computed(() => adapter.api.shortcuts.pluginActions(AI_PLUGIN_ID))
</script>

<template>
  <div class="settings-controls ai-settings">
    <!-- 分区① AI 连接（子组件：分区标题行「AI 连接」+ 恢复默认按钮 + 连接参数五行） -->
    <AIConnectionSettings />

    <!-- 分区② 快捷键：本插件登记的动作（点击键帽录制改键） -->
    <div class="setting-row row-stack">
      <div class="setting-cell">
        <div class="setting-label">{{ t('settings.aiShortcuts') }}</div>
        <div class="setting-desc">{{ t('settings.aiShortcutsDesc') }}</div>
      </div>
    </div>
    <ShortcutActionRow
      v-for="row in pluginActions"
      :key="row.key"
      :action-key="row.key"
      :label="row.label"
    />

    <!-- 分区③ 发散方向（子组件：分区标题行「发散方向」+ 默认方向 + 方向 CRUD） -->
    <AIDirectionsSection />
  </div>
</template>

<style scoped>
/*
 * 三分区之间的分隔：分区间由各 .setting-row 的 border-top 自然分隔，唯独「分区③」的
 * 子组件根容器（.settings-controls，无自带边框）需补顶部边框 + 间距，使三个分区在
 * 视觉上与内置设置面板的 Section 序列一致。
 */
.ai-settings > .settings-controls:not(:first-child) {
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
  margin-top: 6px;
}
</style>
