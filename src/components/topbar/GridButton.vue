<script setup lang="ts">
/**
 * GridButton - 网格模式切换按钮（注册于右顶部条）
 *
 * 激活态反映 gridMode，开启时自动对齐当前视图子节点。
 */
import { computed } from 'vue'
import { GridOutline } from '@vicons/ionicons5'
import { useActiveView } from '@/composables/useActiveView'
import { useCommands } from '@/composables/useCommands'
import { t } from '@/composables/useT'
import TopBarButton from '@/components/common/TopBarButton.vue'

const active = useActiveView()
const commands = useCommands()

/** 当前视图是否开启网格模式（按钮激活态） */
const isGridMode = computed(() => active.view.gridMode)

/**
 * 切换网格模式
 * - 开启：setGridMode(true) 并自动对齐当前视图直接子节点（单条历史，可撤销）
 * - 关闭：setGridMode(false)，保留数据现状
 */
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