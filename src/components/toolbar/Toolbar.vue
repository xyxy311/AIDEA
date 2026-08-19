<script setup lang="ts">
/**
 * Toolbar - 顶部右侧图标栏（原白板工具栏的图标化）
 *
 * 取消原文字按钮样式，改为一排纯图标按钮（左 → 右：调试 → AI 展示模式 → 网格 → 新建节点）。
 * 整个分区在顶部条中右对齐，「新建节点（primary）」落在最右侧最为醒目。
 *
 * - 新建节点：在视口中央创建（主色/高亮）
 * - 网格切换：激活态反映 gridMode，开启时自动对齐当前视图子节点
 * - AI 展示模式：图标随 displayMode 切换，title 提示当前切换目标
 * - 调试：打印当前画布状态到控制台
 * - 节点计数：保留为右侧顶部条末端的纯文字弱显示（纯信息，不与图标化冲突）
 */
import { computed } from 'vue'
import {
  GridOutline,
  ListOutline,
  ContractOutline,
  BugOutline,
  AddCircleOutline,
} from '@vicons/ionicons5'
import { useActiveView } from '@/composables/useActiveView'
import { useCommands } from '@/composables/useCommands'
import { useStageSize } from '@/composables/useStageSize'
import { useAIWordPanel } from '@/composables/useAIWordPanel'
import { t } from '@/composables/useT'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'
import IconBar, { type IconBarItem } from '@/components/layout/IconBar.vue'

const active = useActiveView()
const commands = useCommands()
const { stageWidth, stageHeight } = useStageSize()
// 顶层解构：displayMode 为 ref，模板自动解包；setMode 为函数
const { displayMode, setMode } = useAIWordPanel()

/** 当前视图的节点列表 */
const nodes = computed(() => active.nodeStore.childrenOf(active.project.currentNodeId))

/** 当前视图是否开启网格模式（按钮激活态） */
const isGridMode = computed(() => active.view.gridMode)

/**
 * 切换网格模式
 * - 开启：setGridMode(true) 并自动对齐当前视图直接子节点（单条历史，可撤销）
 * - 关闭：setGridMode(false)，保留数据现状
 */
function handleToggleGrid() {
  if (active.view.gridMode) {
    active.view.setGridMode(false)
  } else {
    active.view.setGridMode(true)
    const childIds = active.nodeStore
      .childrenOf(active.view.viewedNodeId)
      .map((n) => n.id)
    commands.alignNodesToGrid(childIds)
  }
}

/**
 * 在视口中央创建新节点
 *
 * 视口中央 → 屏幕坐标 → 逆变换为世界坐标后创建节点。
 * 无论画布如何平移/缩放，新节点始终出现在当前视野中央。
 */
function handleAddNode() {
  // 视口中心的屏幕坐标
  const viewportCenterX = stageWidth.value / 2
  const viewportCenterY = stageHeight.value / 2

  // 转换为世界坐标：world = (screen - offset) / scale
  const worldX = (viewportCenterX - active.view.stageX) / active.view.stageScale
  const worldY = (viewportCenterY - active.view.stageY) / active.view.stageScale

  // 节点左上角偏移半个尺寸，使节点中心对齐视口中心
  const nodeX = worldX - DEFAULT_NODE_WIDTH / 2
  const nodeY = worldY - DEFAULT_NODE_HEIGHT / 2

  const id = commands.createNode(active.project.currentNodeId, nodeX, nodeY)
  active.view.selectNode(id)
  active.view.startEditing(id)
}

/** 调试打印当前画布状态 */
function debugPrint() {
  console.log('当前画布节点:', nodes.value)
}

/**
 * 右侧功能按钮配置（数组驱动 IconBar，未来加按钮只需在此追加一项）。
 * 数组左 → 右：调试 → AI 展示 → 网格 → 新建节点（最右）。
 */
const items = computed<IconBarItem[]>(() => [
  { id: 'debug', icon: BugOutline, title: t('toolbar.debug'), onClick: debugPrint },
  {
    id: 'ai-mode',
    icon: displayMode.value === 'strip' ? ListOutline : ContractOutline,
    title:
      displayMode.value === 'strip'
        ? t('aiWord.switchToPanel')
        : t('aiWord.switchToStrip'),
    onClick: () => setMode(displayMode.value === 'strip' ? 'panel' : 'strip'),
  },
  {
    id: 'grid',
    icon: GridOutline,
    title: isGridMode.value ? t('toolbar.gridActive') : t('toolbar.grid'),
    onClick: handleToggleGrid,
    active: isGridMode.value,
  },
  {
    id: 'add-node',
    icon: AddCircleOutline,
    title: t('toolbar.addNode'),
    onClick: handleAddNode,
    variant: 'primary',
  },
])
</script>

<template>
  <!-- 右侧分区：图标按钮 + 尾部节点计数，整体在顶部条内右对齐 -->
  <div class="toolbar">
    <IconBar :items="items" />
    <span class="node-count">
      {{ t('toolbar.nodeCount', { count: nodes.length }) }}
    </span>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px;
  flex-shrink: 0;
  user-select: none;
}

/* 节点计数：最右端纯文字弱信息显示 */
.node-count {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  min-width: 0;
}
</style>