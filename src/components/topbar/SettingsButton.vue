<script setup lang="ts">
/**
 * SettingsButton - 设置按钮（注册于左顶部条）
 *
 * 点击直接经 modal store 打开设置模态（modalStore 为全局单例，无注入间接层）；
 * 开关状态归 modal store 统一管理（单实例策略 + 键鼠守卫）。
 */
import { SettingsOutline } from '@vicons/ionicons5'
import { t } from '@/composables/useT'
import TopBarButton from '@/components/common/TopBarButton.vue'
import { useModalStore, SETTINGS_MODAL_KEY } from '@/stores/modal'

const modalStore = useModalStore()

/** 打开设置模态（内置保留 key；已有其他模态打开时 store 内 warn 并拒绝） */
function openSettings(): void {
  modalStore.open(SETTINGS_MODAL_KEY)
}
</script>

<template>
  <TopBarButton
    :icon="SettingsOutline"
    :title="t('menuBar.settings')"
    @click="openSettings"
  />
</template>
