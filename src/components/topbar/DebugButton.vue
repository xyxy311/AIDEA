<script setup lang="ts">
/**
 * DebugButton - 调试按钮（注册于右顶部条）
 *
 * 打印当前画布状态到控制台。
 */
import { computed } from 'vue'
import { BugOutline } from '@vicons/ionicons5'
import { useActiveView } from '@/composables/useActiveView'
import { t } from '@/composables/useT'
import TopBarButton from '@/components/common/TopBarButton.vue'

const active = useActiveView()

/** 当前视图的节点列表 */
const nodes = computed(() => active.nodeStore.childrenOf(active.project.currentNodeId))

/** 调试打印当前画布状态 */
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