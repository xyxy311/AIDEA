<script setup lang="ts">
/**
 * LayoutSection — 设置面板「布局」分区
 *
 * 「恢复默认布局」按钮，确认后调用 layout.resetDock()。
 */
import { NButton, useDialog } from 'naive-ui'
import { useLayoutStore } from '@/stores/layout'
import { t } from '@/composables/useT'
import '@/components/settings/settings-shared.css'

const layout = useLayoutStore()
const dialog = useDialog()

/** 恢复默认布局：先弹确认框，确认后调用 layout.resetDock() */
function handleResetLayout(): void {
  dialog.warning({
    title: t('settings.resetLayout'),
    content: t('settings.resetLayoutConfirm'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => layout.resetDock(),
  })
}
</script>

<template>
  <div class="settings-controls">
    <div class="setting-row">
      <div class="setting-cell">
        <div class="setting-label">{{ t('settings.resetLayout') }}</div>
        <div class="setting-desc">{{ t('settings.resetLayoutHint') }}</div>
      </div>
      <NButton size="small" @click="handleResetLayout">
        {{ t('settings.resetLayout') }}
      </NButton>
    </div>
  </div>
</template>