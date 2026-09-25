<script setup lang="ts">
// UndoButton - 撤销按钮（左顶条），无可撤销时禁用。
import { ArrowUndoOutline } from '@vicons/ionicons5'
import { useCommands } from '@/composables/useCommands'
import { t } from '@/composables/useT'
import TopBarButton from '@/components/common/TopBarButton.vue'

const commands = useCommands()
</script>

<template>
  <TopBarButton
    :icon="ArrowUndoOutline"
    :title="t('menuBar.undo')"
    :disabled="!commands.canUndo.value"
    @click="commands.undo()"
  />
</template>