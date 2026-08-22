<script lang="ts">
/**
 * IconBar - 可扩展的图标按钮分区组件
 *
 * 接收一组按钮配置，渲染为一横向排纯图标按钮。
 * - 悬停有 NTooltip 文字提示（与左侧活动栏保持同一视觉语言）
 * - 支持 active 激活态（如网格开关）与 primary 主样式（如「新建节点」）
 * - 支持「更多选项」下拉菜单：item.menu 存在时按钮角落显示小三角，点击弹出
 *   NDropdown（如保存→另存为、打开→新建/打开最近文件）
 * - 未来新增功能按钮 = 在配置数组里加一项，无需改动本组件
 *
 * 每个按钮占位由父组件在配置里预先 t() 翻译好的文案作为 title。
 */
import type { Component } from 'vue'
import type { DropdownOption } from 'naive-ui'

/**
 * 下拉菜单单项。
 * 基于 Naive 的 DropdownOption，追加可选 onSelect 回调（叶子项调用）。
 * 支持 children 实现子菜单（如「打开最近文件」下列出最近文件）。
 */
export type IconBarMenuOption = DropdownOption & { onSelect?: () => void }

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
  /** 「更多选项」下拉菜单（存在时按钮角落显示小三角，点击弹出） */
  menu?: IconBarMenuOption[]
}
</script>

<script setup lang="ts">
import { NDropdown, NTooltip } from 'naive-ui'

defineProps<{
  items: IconBarItem[]
}>()

/** 在菜单树中按 key 查找选项（含子菜单递归） */
function findOption(
  options: IconBarMenuOption[] | undefined,
  key: string | number,
): IconBarMenuOption | undefined {
  for (const o of options ?? []) {
    if (o.key === key) return o
    const found = findOption(o.children as IconBarMenuOption[] | undefined, key)
    if (found) return found
  }
  return undefined
}

/** 下拉菜单项选中：沿树找到对应选项并触发其 onSelect */
function handleMenuSelect(item: IconBarItem, key: string | number): void {
  findOption(item.menu, key)?.onSelect?.()
}
</script>

<template>
  <div class="icon-bar">
    <NTooltip
      v-for="item in items"
      :key="item.id"
      placement="bottom"
      :disabled="!!item.menu"
    >
      <template #trigger>
        <!-- 含下拉菜单：主图标（主操作） + 独立小三角触发区（split button），
             两者为兄弟节点互不争抢点击，避免「一点既打开又弹菜单」 -->
        <div v-if="item.menu" class="icon-bar-split">
          <button
            type="button"
            class="icon-bar-btn-main"
            :disabled="item.disabled"
            @click="item.onClick"
          >
            <component :is="item.icon" class="icon-bar-icon" />
          </button>
          <NDropdown
            :options="item.menu"
            trigger="click"
            @select="(key) => handleMenuSelect(item, key)"
          >
            <span class="icon-bar-caret" aria-hidden="true" />
          </NDropdown>
        </div>
        <button
          v-else
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

/* 含下拉菜单的按钮：主图标占据主体，右下角为小三角触发区 */
.icon-bar-split {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 36px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
}

.icon-bar-btn-main {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--color-text);
  opacity: 0.7;
  transition: background 0.15s, opacity 0.15s;
}

.icon-bar-split:hover .icon-bar-btn-main {
  opacity: 1;
  background: var(--color-hover);
}

.icon-bar-btn-main:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.icon-bar-icon {
  width: 20px;
  height: 20px;
  pointer-events: none; /* 让点击穿透到按钮本体 */
}

/* “更多选项”小三角触发区：点击弹出下拉菜单 */
.icon-bar-caret {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 13px;
  height: 13px;
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 1px;
  border-radius: 4px;
  cursor: pointer;
  /* 高悬停可点区，轻微反馈 */
  transition: background 0.15s;
}

.icon-bar-caret::before {
  content: '';
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--color-text);
  opacity: 0.8;
}

.icon-bar-caret:hover {
  background: var(--color-hover);
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