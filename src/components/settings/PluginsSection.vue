<script setup lang="ts">
/**
 * PluginsSection — 设置面板「插件」栏目：展示插件清单与运行时状态；启停与代码变更
 * 经「重新加载」按钮立即生效（manager.disposeAll → 重扫目录 → installAll 重装）。
 */
import { NButton, NEmpty, NSwitch, NTag } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { usePluginStore } from '@/stores/plugin'
import type { PluginStatus } from '@/plugin/manager'
import { t } from '@/composables/useT'
import '@/components/settings/settings-shared.css'

const plugin = usePluginStore()
const { records, ready, reloading, dirDirty } = storeToRefs(plugin)

/** 状态 → 徽标类型与 i18n 标签 key（运行态展示；错误态再补充红字文案） */
const STATUS_META: Record<PluginStatus, { tagType: 'success' | 'error' | 'default'; labelKey: string }> = {
  installed: { tagType: 'default', labelKey: 'plugin.statusInstalled' },
  active: { tagType: 'success', labelKey: 'plugin.statusActive' },
  error: { tagType: 'error', labelKey: 'plugin.statusError' },
}
</script>

<template>
  <div class="plugin-manager">
    <!-- 提示行：重新加载说明文案左、目录变更徽标 + 重新加载按钮右（dirDirty 仅桌面桥推送置位，web 恒 false） -->
    <div class="plugin-hint-row">
      <p class="settings-hint plugin-hint">{{ t('plugin.reloadHint') }}</p>
      <div class="plugin-hint-actions">
        <NTag v-if="dirDirty" type="warning" size="tiny" :bordered="false" class="plugin-dirty">
          {{ t('plugin.dirDirty') }}
        </NTag>
        <NButton size="small" :loading="reloading" :disabled="reloading" @click="plugin.reload()">
          {{ t('plugin.reload') }}
        </NButton>
      </div>
    </div>

    <template v-if="ready">
      <NEmpty v-if="records.length === 0" :description="t('plugin.empty')" size="small" />

      <div v-else class="settings-controls">
        <div v-for="rec in records" :key="rec.id" class="plugin-item">
          <!-- 左：元信息 + 状态 -->
          <div class="setting-cell plugin-info">
            <div class="plugin-title">
              <span class="plugin-name">{{ rec.name }}</span>
              <span class="plugin-version">v{{ rec.version || '—' }}</span>
            </div>
            <div class="plugin-meta">
              <span v-if="rec.author" class="plugin-author">{{ t('plugin.author') }} · {{ rec.author }}</span>
              <NTag size="tiny" :type="STATUS_META[rec.status].tagType" class="plugin-tag">
                {{ t(STATUS_META[rec.status].labelKey) }}
              </NTag>
            </div>
            <div class="setting-desc plugin-desc">{{ rec.description || '—' }}</div>
            <div v-if="rec.status === 'error' && rec.error" class="plugin-error">{{ rec.error }}</div>
          </div>

          <!-- 右：启用开关（启停仅持久化 → 重新加载生效），title 注明重新加载后生效 -->
          <NSwitch
            :value="rec.enabled"
            size="small"
            :disabled="reloading"
            :title="t('plugin.restartRequired')"
            @update:value="(v: boolean) => plugin.setEnabled(rec.id, v)"
          />
        </div>
      </div>
    </template>
    <span v-else class="plugin-loading">{{ t('plugin.loading') }}</span>
  </div>
</template>

<style scoped>
.plugin-manager {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.plugin-hint-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 8px;
}

.plugin-hint {
  margin: 0;
  color: var(--color-text-muted);
}

/* 提示行右侧动作区：目录变更徽标 + 重新加载按钮 */
.plugin-hint-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 目录变更徽标：小徽标风格 */
.plugin-dirty {
  --n-font-size: 11px;
  flex-shrink: 0;
}

.plugin-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-top: 1px solid var(--color-border);
}

.plugin-item:first-of-type {
  border-top: none;
  padding-top: 4px;
}

.plugin-info {
  flex: 1;
  min-width: 0;
}

.plugin-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.plugin-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.plugin-version {
  font-size: 12px;
  color: var(--color-text-muted);
}

.plugin-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.plugin-author {
  font-size: 12px;
  color: var(--color-text-muted);
}

.plugin-tag {
  --n-font-size: 12px;
}

.plugin-desc {
  margin-top: 2px;
}

.plugin-error {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-error);
  word-break: break-all;
}

.plugin-loading {
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>