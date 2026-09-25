<script setup lang="ts">
// AddNodeButton - 新建节点按钮（右顶条 primary），在视口中央创建新节点。
import { AddCircleOutline } from '@vicons/ionicons5'
import { useActiveView } from '@/composables/useActiveView'
import { useCommands } from '@/composables/useCommands'
import { useStageSize } from '@/composables/useStageSize'
import { t } from '@/composables/useT'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'
import TopBarButton from '@/components/common/TopBarButton.vue'

const active = useActiveView()
const commands = useCommands()
const { stageWidth, stageHeight } = useStageSize()

// 视口中央经逆变换为世界坐标，确保新节点始终落在当前视野中央
function handleAddNode(): void {
  const viewportCenterX = stageWidth.value / 2
  const viewportCenterY = stageHeight.value / 2

  const worldX = (viewportCenterX - active.view.stageX) / active.view.stageScale
  const worldY = (viewportCenterY - active.view.stageY) / active.view.stageScale

  const nodeX = worldX - DEFAULT_NODE_WIDTH / 2
  const nodeY = worldY - DEFAULT_NODE_HEIGHT / 2

  const id = commands.createNode(active.project.currentNodeId, nodeX, nodeY)
  active.view.selectNode(id)
  active.view.startEditing(id)
}
</script>

<template>
  <TopBarButton
    :icon="AddCircleOutline"
    :title="t('toolbar.addNode')"
    variant="primary"
    @click="handleAddNode"
  />
</template>