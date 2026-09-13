<script setup lang="ts">
/**
 * AIConnectionSettings — 「AI 设置」栏目的分区①「AI 连接」（子组件，无自带 header）。
 *
 * 职责：
 * - 分区标题行：「AI 连接」+ 说明 + 「恢复默认连接配置」按钮（分区粒度标题，非栏目级
 *   ——栏目标题「AI 设置」由设置弹窗渲染，避免与 AISettingsPanel 顶层重复）；
 * - 连接配置：直接绑定 useAIConfigStore 的可写字段（baseURL / model / apiKey /
 *   timeoutMs / temperature），改动即时写回插件 config（`aidea-plugin-config.ai` 的
 *   data.connection，即时持久化、不入项目历史），无需本地镜像；
 *   「恢复默认连接配置」经 store.resetToDefaults()（watch 自动写回）。
 * - 布局沿用内置 Settings Section 的 .settings-controls/.setting-row 结构
 *   （SDK 共享样式 settings-shared.css 经 adapter 统一注入，与 AIDirectionsSection 写法一致）。
 * 注意：组件不得 import 插件入口 index.ts（会被入口 import，构成循环依赖）。
 * 快捷键改键分区已上移 AISettingsPanel（分区②），本组件只负责连接参数。
 */
import { NButton, NInput, NInputNumber } from 'naive-ui'
import { useAIConfigStore } from '../stores/aiConfig'
import { AI_DEFAULT_CONFIG } from '../constants'
import { t } from '../i18n'

const aiConfig = useAIConfigStore()

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
    <!-- 分区标题 + 恢复默认 -->
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
  </div>
</template>
