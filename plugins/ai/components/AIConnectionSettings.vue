<script setup lang="ts">
/**
 * AIConnectionSettings —— 插件「AI 连接」设置栏目内容组件（无自带 header）。
 *
 * 演示/职责：
 * - 连接配置：直接绑定 useAIConfigStore 的可写字段（baseURL / model / apiKey /
 *   timeoutMs / temperature），改动即时写回插件 config（`aidea-plugin-config.ai` 的
 *   data.connection，即时持久化、不入项目历史），无需本地镜像；
 *   「恢复默认连接配置」经 store.resetToDefaults()（watch 自动写回）。
 * - 快捷键改键 UI：经 `adapter.api.shortcuts.pluginActions(AI_PLUGIN_ID)`（computed 包裹
 *   保持响应，注册 / 回滚联动）动态渲染 SDK 导出的 ShortcutActionRow——
 *   录制改键 / 恢复默认 / 冲突提示在组件内闭环，插件动作的改键入口独占在插件自身设置栏目。
 * - 布局沿用内置 Settings Section 的 .settings-controls/.setting-row 结构
 *   （import 主程序 settings-shared.css，与 AIDirectionsSection 写法一致）。
 * 注意：组件不得 import 插件入口 index.ts（会被入口 import，构成循环依赖）；
 * 插件 id 统一取 AI_PLUGIN_ID 常量，不硬编码 'ai'。
 */
import { computed } from 'vue'
import { NButton, NInput, NInputNumber } from 'naive-ui'
import { adapter, ShortcutActionRow } from '@/plugin/adapter'
import { useAIConfigStore } from '../stores/aiConfig'
import { AI_DEFAULT_CONFIG, AI_PLUGIN_ID } from '../constants'
import { t } from '@/composables/useT'
import '@/components/settings/settings-shared.css'

const aiConfig = useAIConfigStore()

/** 本插件登记的快捷键动作（key=完整登记 key，label=成品文案）；computed 保持 uiRegistry 联动 */
const pluginActions = computed(() => adapter.api.shortcuts.pluginActions(AI_PLUGIN_ID))

/**
 * NInputNumber 清空时 value 为 null：忽略（保留现值），
 * 避免 null 写入 number 字段（否则 providerConfig 归一会得到 0）。
 */
function onNumber(key: 'timeoutMs' | 'temperature', value: number | null): void {
  if (value == null) return
  aiConfig[key] = value
}

/** 恢复默认连接配置（store 内 watch 自动写回插件 config） */
function handleReset(): void {
  aiConfig.resetToDefaults()
}
</script>

<template>
  <div class="settings-controls">
    <!-- 栏目说明 + 恢复默认 -->
    <div class="setting-row row-stack">
      <div class="setting-cell">
        <div class="setting-label">{{ t('settings.aiConnection') }}</div>
        <div class="setting-desc">{{ t('settings.aiConnectionDesc') }}</div>
      </div>
      <NButton size="small" @click="handleReset">
        {{ t('settings.aiConnectionReset') }}
      </NButton>
    </div>

    <!-- 接口地址 -->
    <div class="setting-row row-stack">
      <div class="setting-cell">
        <div class="setting-label">{{ t('settings.aiBaseURL') }}</div>
        <div class="setting-desc">{{ t('settings.aiBaseURLDesc') }}</div>
      </div>
      <NInput
        v-model:value="aiConfig.baseURL"
        size="small"
        :placeholder="AI_DEFAULT_CONFIG.baseURL"
      />
    </div>

    <!-- 模型名称 -->
    <div class="setting-row row-stack">
      <div class="setting-cell">
        <div class="setting-label">{{ t('settings.aiModel') }}</div>
        <div class="setting-desc">{{ t('settings.aiModelDesc') }}</div>
      </div>
      <NInput
        v-model:value="aiConfig.model"
        size="small"
        placeholder="qwen2.5"
      />
    </div>

    <!-- API Key（可选） -->
    <div class="setting-row row-stack">
      <div class="setting-cell">
        <div class="setting-label">{{ t('settings.aiApiKey') }}</div>
        <div class="setting-desc">{{ t('settings.aiApiKeyDesc') }}</div>
      </div>
      <NInput
        v-model:value="aiConfig.apiKey"
        size="small"
        type="password"
        show-password-on="click"
      />
    </div>

    <!-- 超时（毫秒） -->
    <div class="setting-row row-stack">
      <div class="setting-cell">
        <div class="setting-label">{{ t('settings.aiTimeout') }}</div>
      </div>
      <NInputNumber
        :value="aiConfig.timeoutMs"
        size="small"
        :min="1000"
        :step="1000"
        @update:value="(v: number | null) => onNumber('timeoutMs', v)"
      />
    </div>

    <!-- 温度 -->
    <div class="setting-row row-stack">
      <div class="setting-cell">
        <div class="setting-label">{{ t('settings.aiTemperature') }}</div>
      </div>
      <NInputNumber
        :value="aiConfig.temperature"
        size="small"
        :min="0"
        :max="2"
        :step="0.1"
        @update:value="(v: number | null) => onNumber('temperature', v)"
      />
    </div>

    <!-- 快捷键改键（本插件注册的动作；点击键帽录制） -->
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
  </div>
</template>
