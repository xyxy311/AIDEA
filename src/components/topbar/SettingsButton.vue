<script setup lang="ts">
// SettingsButton - 设置按钮（左顶条），直接经全局 modal store 单例打开设置模态。
import { SettingsOutline } from '@vicons/ionicons5'
import { t } from '@/composables/useT'
import TopBarButton from '@/components/common/TopBarButton.vue'
import { useModalStore, SETTINGS_MODAL_KEY } from '@/stores/modal'

const modalStore = useModalStore()

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
