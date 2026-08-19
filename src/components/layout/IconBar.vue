<script lang="ts">
/**
 * IconBar - 可扩展的图标按钮分区组件
 *
 * 接收一组按钮配置，渲染为一横向排纯图标按钮。
 * - 悬停有 NTooltip 文字提示（与左侧活动栏保持同一视觉语言）
 * - 支持 active 激活态（如网格开关）与 primary 主样式（如「新建节点」）
 * - 未来新增功能按钮 = 在配置数组里加一项，无需改动本组件
 *
 * 每个按钮占位由父组件在配置里预先 t() 翻译好的文案作为 title。
 */
import type { Component } from 'vue'

/** 单个图标按钮配置 */
export interface IconBarItem {
  /** 唯一标识 */
  id: string
  /** 图标组件（@vicons/ionicons5） */
  icon: Component
  /** hover 提示文案（已经过 t() 翻译） */
  title: string
  /** 点击回调（可省略，仅展示/占位用） */
  onClick?: () => void
  /** 禁用态（如 canUndo/canRedo 为 false 时禁用） */
  disabled?: boolean
  /** 激活态高亮（如网格开启 / 展示模式） */
  active?: boolean
  /** 样式变体：primary = 主色填充（用于最重要的主操作） */
  variant?: 'default' | 'primary'
}
</script>

<script setup lang="ts">
import { NTooltip } from 'naive-ui'

defineProps<{
  items: IconBarItem[]
}>()
</script>

<template>
  <div class="icon-bar">
    <NTooltip v-for="item in items" :key="item.id" placement="bottom">
      <template #trigger>
        <button
          type="button"
          class="icon-bar-btn"
          :class="{
            active: item.active,
            primary: item.variant === 'primary',
          }"
          :disabled="item.disabled"
          @click="item.onClick"
        >
          <component :is="item.icon" class="icon-bar-icon" />
        </button>
      </template>
      {{ item.title }}
    </NTooltip>
  </div>
</template>

<style scoped>
.icon-bar {
  display: flex;
  align-items: center;
  gap: 2px;
}

.icon-bar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--color-text);
  opacity: 0.7;
  transition: background 0.15s, opacity 0.15s, color 0.15s;
  position: relative;
  flex-shrink: 0;
}

.icon-bar-icon {
  width: 20px;
  height: 20px;
}

/* 悬停：亮起 + 淡背景（与活动栏 hover 一致） */
.icon-bar-btn:hover:not(:disabled) {
  opacity: 1;
  background: var(--color-hover);
}

/* 禁用态：弱化 + 不响应 */
.icon-bar-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 激活态：底部主色指示条 + 高亮背景（用于网格开关等） */
.icon-bar-btn.active {
  opacity: 1;
  background: var(--color-active-bg);
  color: var(--color-text);
}

.icon-bar-btn.active::after {
  content: '';
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 2px;
  height: 3px;
  border-radius: 2px;
  background: var(--color-primary);
}

/* 主操作变体（新建节点）：主色填充醒目 */
.icon-bar-btn.primary {
  width: 40px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  opacity: 1;
}

.icon-bar-btn.primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.icon-bar-btn.primary:active:not(:disabled) {
  background: var(--color-primary-pressed);
}

.icon-bar-btn.primary:disabled {
  opacity: 0.3;
}

.icon-bar-btn.primary.active::after {
  background: var(--color-on-primary);
}
</style>