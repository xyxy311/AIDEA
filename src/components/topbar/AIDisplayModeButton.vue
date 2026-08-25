<script setup lang="ts">
/**
 * AIDisplayModeButton - AI 展示模式切换按钮（注册于右顶部条）
 *
 * 图标随 displayMode 切换（panel ↔ strip），title 提示当前切换目标。
 */
import { ListOutline, ContractOutline } from '@vicons/ionicons5'
import { useAIWordPanel } from '@/composables/useAIWordPanel'
import { t } from '@/composables/useT'
import TopBarButton from '@/components/common/TopBarButton.vue'

// 顶层解构：displayMode 为 ref，模板自动解包；setMode 为函数
const { displayMode, setMode } = useAIWordPanel()
</script>

<template>
  <TopBarButton
    :icon="displayMode === 'strip' ? ListOutline : ContractOutline"
    :title="displayMode === 'strip' ? t('aiWord.switchToPanel') : t('aiWord.switchToStrip')"
    @click="setMode(displayMode === 'strip' ? 'panel' : 'strip')"
  />
</template>