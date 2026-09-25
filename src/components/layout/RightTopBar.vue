<script setup lang="ts">
/**
 * RightTopBar - 右顶部条（原 Toolbar 更名为）：顶部右侧图标栏，按钮经品类表
 * constants/topbar.ts 注册，顺序与拖拽由 TopBarZone 承担（固定 zone='right' 薄封装）。
 * 尾部节点计数为纯文字弱显示；WindowControls 是固定窗口 chrome（不参与拖拽排序，强制最右）。
 */
import { computed } from 'vue'
import { useActiveView } from '@/composables/useActiveView'
import { t } from '@/composables/useT'
import TopBarZone from '@/components/common/TopBarZone.vue'
import WindowControls from '@/components/topbar/WindowControls.vue'

const active = useActiveView()

/** 当前视图的节点列表（节点计数） */
const nodes = computed(() => active.nodeStore.childrenOf(active.project.currentNodeId))
</script>

<template>
  <!-- 图标按钮（可拖拽）+ 尾部节点计数 + 固定窗口控制组，整体在顶部条内右对齐 -->
  <div class="right-top-bar">
    <TopBarZone zone="right" />
    <span class="node-count">
      {{ t('toolbar.nodeCount', { count: nodes.length }) }}
    </span>
    <!-- 固定窗口 chrome：最右端的窗口控制按钮组（不参与品类表与拖拽排序） -->
    <WindowControls />
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