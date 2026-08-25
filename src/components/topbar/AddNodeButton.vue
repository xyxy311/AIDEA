<script setup lang="ts">
/**
 * AddNodeButton - 新建节点按钮（注册于右顶部条，primary 主色）
 *
 * 在视口中央创建新节点。
 */
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

/**
 * 在视口中央创建新节点。
 * 视口中央 → 屏幕坐标 → 逆变换为世界坐标后创建节点；
 * 无论画布如何平移/缩放，新节点始终出现在当前视野中央。
 */
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