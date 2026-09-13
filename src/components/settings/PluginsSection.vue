<script setup lang="ts">
/**
 * PluginsSection — 设置面板「插件」栏目：插件管理（纯内容组件，无 header）
 *
 * 展示已发现插件清单：名称 / 版本 / 作者 / 描述 / 运行时状态（运行中·已安装·错误），
 * 每项提供「启用」开关。启停**仅持久化 → 重启应用生效**（不做动态卸载注册），
 * 开关反映持久化意愿即可。records 随 init 异步逐步填充，直接响应式遍历。
 */
import { NEmpty, NSwitch, NTag } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { usePluginStore } from '@/stores/plugin'
import type { PluginStatus } from '@/plugin/manager'
import { t } from '@/composables/useT'
import '@/components/settings/settings-shared.css'

const plugin = usePluginStore()
const { records, ready } = storeToRefs(plugin)

/** 状态 → 徽标类型与 i18n 标签 key（运行态展示；错误态再补充红字文案） */
const STATUS_META: Record<PluginStatus, { tagType: 'success' | 'error' | 'default'; labelKey: string }> = {
  installed: { tagType: 'default', labelKey: 'plugin.statusInstalled' },
  active: { tagType: 'success', labelKey: 'plugin.statusActive' },
  error: { tagType: 'error', labelKey: 'plugin.statusError' },
}
</script>

<template>
  <div class="plugin-manager">
    <p class="settings-hint plugin-hint">{{ t('plugin.reloadHint') }}</p>

    <template v-if="ready">
      <NEmpty v-if="records.length === 0" :description="t('plugin.empty')" size="small" />

      <div v-else class="settings-controls">
        <div v-for="rec in records" :key="rec.id" class="plugin-item">
          <!-- 左：元信息 + 状态 -->
          <div class="setting-cell plugin-info">
            <div class="plugin-title">
              <span class="plugin-name">{{ rec.name }}</span>
              <span class="plugin-version">v{{ rec.version || '—' }}</span>
              <!-- 来源徽标（从简小标签）：builtin=随包内置 / local=桌面本地目录 -->
              <NTag size="tiny" :bordered="false" class="plugin-source">
                {{ t(rec.source === 'local' ? 'plugin.sourceLocal' : 'plugin.sourceBuiltin') }}
              </NTag>
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

          <!-- 右：启用开关（启停仅持久化 → 重启生效），title 注明重启后生效 -->
          <NSwitch
            :value="rec.enabled"
            size="small"
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

.plugin-hint {
  margin: 0 0 8px;
  color: var(--color-text-muted);
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

.plugin-source {
  --n-font-size: 11px;
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