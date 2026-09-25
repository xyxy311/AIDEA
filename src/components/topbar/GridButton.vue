<script setup lang="ts">
// GridButton - 网格模式切换按钮（右顶条）；激活态反映 gridMode，开启时对齐当前视图子节点。
import { computed } from 'vue'
import { GridOutline } from '@vicons/ionicons5'
import { useActiveView } from '@/composables/useActiveView'
import { useCommands } from '@/composables/useCommands'
import { t } from '@/composables/useT'
import TopBarButton from '@/components/common/TopBarButton.vue'

const active = useActiveView()
const commands = useCommands()

const isGridMode = computed(() => active.view.gridMode)

// 开启时同步对齐当前视图直接子节点（单条历史，可撤销）
function handleToggleGrid(): void {
  if (active.view.gridMode) {
    active.view.setGridMode(false)
  } else {
    active.view.setGridMode(true)
    const childIds = active.nodeStore.childrenOf(active.view.viewedNodeId).map((n) => n.id)
    commands.alignNodesToGrid(childIds)
  }
}
</script>

<template>
  <TopBarButton
    :icon="GridOutline"
    :title="isGridMode ? t('toolbar.gridActive') : t('toolbar.grid')"
    :active="isGridMode"
    @click="handleToggleGrid"
  />
</template>