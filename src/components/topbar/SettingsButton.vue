<script setup lang="ts">
/**
 * SettingsButton - 设置按钮（注册于左顶部条）
 *
 * 点击触发 AppShell 注入的 openSettings 回调（打开设置弹窗）。
 */
import { inject } from 'vue'
import { SettingsOutline } from '@vicons/ionicons5'
import { t } from '@/composables/useT'
import TopBarButton from '@/components/common/TopBarButton.vue'

// AppShell 注入：打开设置弹窗（提供单实例状态）
const openSettings = inject<() => void>('openSettings', () => {})
</script>

<template>
  <TopBarButton
    :icon="SettingsOutline"
    :title="t('menuBar.settings')"
    @click="openSettings()"
  />
</template>