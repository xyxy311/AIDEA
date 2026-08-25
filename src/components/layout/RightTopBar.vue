<script setup lang="ts">
/**
 * RightTopBar - 右顶部条（原 Toolbar 更名为）
 *
 * 顶部右侧图标栏，存放右向功能按钮（调试 / AI 展示模式 / 网格 / 新建节点，从右到左，
 * 新建节点 primary 最右最醒目）。按钮由品类表 constants/topbar.ts 注册，
 * 顺序与拖拽由通用容器 TopBarZone 承担，本组件只是固定 zone='right' 的薄封装。
 *
 * 节点计数保留为右顶部条末端的纯文字弱显示（纯信息，不属于可拖拽按钮）。
 */
import { computed } from 'vue'
import { useActiveView } from '@/composables/useActiveView'
import { t } from '@/composables/useT'
import TopBarZone from '@/components/common/TopBarZone.vue'

const active = useActiveView()

/** 当前视图的节点列表（节点计数） */
const nodes = computed(() => active.nodeStore.childrenOf(active.project.currentNodeId))
</script>

<template>
  <!-- 图标按钮（可拖拽）+ 尾部节点计数，整体在顶部条内右对齐 -->
  <div class="right-top-bar">
    <TopBarZone zone="right" />
    <span class="node-count">
      {{ t('toolbar.nodeCount', { count: nodes.length }) }}
    </span>
  </div>
</template>

<style scoped>
.right-top-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px;
  flex-shrink: 0; /* 保持自然宽度：被 WheelScroll 包裹时超出可按滚轮横向滚动 */
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