<script setup lang="ts">
/**
 * Toolbar - 白板顶部工具栏
 *
 * 提供节点创建、删除、状态显示功能。
 * 通过 useWhiteboardStore 直接操作状态。
 */
import { computed } from 'vue'
import { useActiveView } from '@/composables/useActiveView'
import { useCommands } from '@/composables/useCommands'
import { useStageSize } from '@/composables/useStageSize'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'

const active = useActiveView()
const commands = useCommands()
const { stageWidth, stageHeight } = useStageSize()

/** 当前视图的节点列表 */
const nodes = computed(() => active.nodeStore.childrenOf(active.project.activeViewId))

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

  const id = commands.createNode(active.project.activeViewId, nodeX, nodeY)
  active.view.selectNode(id)
  active.view.startEditing(id)
}

/** 调试打印当前画布状态 */
function debugPrint() {
  console.log('当前画布节点:', nodes.value)
}
</script>

<template>
  <header class="toolbar">
    <div class="toolbar-left">
      <h1 class="toolbar-title">白板</h1>
    </div>

    <div class="toolbar-center">
      <button class="btn btn-primary" @click="handleAddNode">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          class="btn-icon"
        >
          <path
            d="M8 3v10M3 8h10"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        添加节点
      </button>
      <button class="btn btn-primary" @click="debugPrint">
        调试
      </button>
    </div>

    <div class="toolbar-right">
      <span class="node-count">
        节点：{{ nodes.length }}
      </span>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--toolbar-height, 56px);
  padding: 0 16px;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  user-select: none;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
}

.toolbar-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
  white-space: nowrap;
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  align-items: center;
}

/* ── 按钮基础样式 ── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, opacity 0.15s;
  line-height: 1.5;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-icon {
  flex-shrink: 0;
  display: block;
}

/* ── 主要按钮（添加节点） ── */
.btn-primary {
  background-color: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.btn-primary:hover:not(:disabled) {
  background-color: #2563eb;
  border-color: #2563eb;
}

.btn-primary:active:not(:disabled) {
  background-color: #1d4ed8;
}

/* ── 节点计数 ── */
.node-count {
  font-size: 13px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
</style>
