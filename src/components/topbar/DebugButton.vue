<script setup lang="ts">
// DebugButton - 调试按钮（右顶条），打印当前画布状态。
import { computed } from 'vue'
import { BugOutline } from '@vicons/ionicons5'
import { useActiveView } from '@/composables/useActiveView'
import { t } from '@/composables/useT'
import TopBarButton from '@/components/common/TopBarButton.vue'

const active = useActiveView()

const nodes = computed(() => active.nodeStore.childrenOf(active.project.currentNodeId))

function debugPrint(): void {
  console.log('当前画布节点:', nodes.value)
}
</script>

<template>
  <TopBarButton
    :icon="BugOutline"
    :title="t('toolbar.debug')"
    @click="debugPrint"
  />
</template>