<script setup lang="ts">
/**
 * RedoButton - 重做按钮（注册于左顶部条）
 */
import { ArrowRedoOutline } from '@vicons/ionicons5'
import { useCommands } from '@/composables/useCommands'
import { t } from '@/composables/useT'
import TopBarButton from '@/components/common/TopBarButton.vue'

const commands = useCommands()
</script>

<template>
  <TopBarButton
    :icon="ArrowRedoOutline"
    :title="t('menuBar.redo')"
    :disabled="!commands.canRedo.value"
    @click="commands.redo()"
  />
</template>